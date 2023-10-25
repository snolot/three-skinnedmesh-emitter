import * as THREE from '../../three.js-131/build/three.module.js';
const GPUComputationRenderer = ( sizeX, sizeY, renderer ) => {

	const variables = [];

	let currentTextureIndex = 0;

	const scene = new THREE.Scene();
	const camera = new THREE.Camera();

	camera.position.z = 1;

	const passThruUniforms = {
		passThruTexture: { value: null }
	};

	const addVariable = ( variableName, computeFragmentShader, initialValueTexture ) => {
		const material = createShaderMaterial( computeFragmentShader );

		const variable = {
			name: variableName,
			initialValueTexture: initialValueTexture,
			material: material,
			dependencies: null,
			renderTargets: [],
			wrapS: null,
			wrapT: null,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter
		};

		variables.push( variable );

		return variable;
	};

	const setVariableDependencies = (variable, dependencies) => {
		variable.dependencies = dependencies;
	};

	const init = () => {
		if ( ! renderer.capabilities.isWebGL2 &&
			 ! renderer.extensions.get( "OES_texture_float" ) ) {

			return "No OES_texture_float support for float textures.";
		}

		if ( renderer.capabilities.maxVertexTextures === 0 ) {
			return "No support for vertex shader textures.";
		}

		console.log(variables);

		for ( let i = 0; i < variables.length; i ++ ) {
			const variable = variables[ i ];

			// Creates rendertargets and initialize them with input texture
			variable.renderTargets[ 0 ] = createRenderTarget( sizeX, sizeY, variable.wrapS, variable.wrapT, variable.minFilter, variable.magFilter );
			variable.renderTargets[ 1 ] = createRenderTarget( sizeX, sizeY, variable.wrapS, variable.wrapT, variable.minFilter, variable.magFilter );
			renderTexture( variable.initialValueTexture, variable.renderTargets[ 0 ] );
			renderTexture( variable.initialValueTexture, variable.renderTargets[ 1 ] );

			// Adds dependencies uniforms to the ShaderMaterial
			const material = variable.material;
			const uniforms = material.uniforms;

			if ( variable.dependencies !== null ) {
				for ( let d = 0; d < variable.dependencies.length; d ++ ) {
					const depVar = variable.dependencies[ d ];
					
					if ( depVar.name !== variable.name ) {
						// Checks if variable exists
						let found = false;
						for ( let j = 0; j < variables.length; j ++ ) {
							if ( depVar.name === variables[ j ].name ) {
								found = true;
								break;
							}
						}
						if ( ! found ) {
							return "Variable dependency not found. Variable=" + variable.name + ", dependency=" + depVar.name;
						}
					}
					
					uniforms[ depVar.name ] = { value: null };
					material.fragmentShader = "\nuniform sampler2D " + depVar.name + ";\n" + material.fragmentShader;

					//console.log(depVar.name, uniforms[depVar.name]);

				}
			}
		}

		currentTextureIndex = 0;
		return null;
	};

	const compute = () => {

		const _currentTextureIndex = currentTextureIndex;
		const nextTextureIndex = _currentTextureIndex === 0 ? 1 : 0;

		for (let i = 0, il = variables.length; i < il; i ++) {
			const variable = variables[i];
			//console.log(variable);

			// Sets texture dependencies uniforms
			if ( variable.dependencies !== null ) {
				const uniforms = variable.material.uniforms;
				for ( let d = 0, dl = variable.dependencies.length; d < dl; d ++ ) {
					const depVar = variable.dependencies[ d ];
					
					uniforms[ depVar.name ].value = depVar.renderTargets[ _currentTextureIndex ].texture;
					//console.log(depVar.name, uniforms[ depVar.name ])
				}
			}
			// Performs the computation for this variable
			doRenderTarget( variable.material, variable.renderTargets[ nextTextureIndex ] );
		}
		currentTextureIndex = nextTextureIndex;
	};

	const getCurrentRenderTarget = (variable) => {
		return variable.renderTargets[currentTextureIndex];
	};

	const getAlternateRenderTarget = ( variable ) => {
		return variable.renderTargets[ currentTextureIndex === 0 ? 1 : 0 ];
	};

	const addResolutionDefine = ( materialShader ) => {
		materialShader.defines.resolution = 'vec2( ' + sizeX.toFixed( 1 ) + ', ' + sizeY.toFixed( 1 ) + " )";
	}
	// The following functions can be used to compute things manually

	const createShaderMaterial = ( computeFragmentShader, uniforms ) => {
		uniforms = uniforms || {};

		const material = new THREE.ShaderMaterial( {
			uniforms: uniforms,
			vertexShader: getPassThroughVertexShader(),
			fragmentShader: computeFragmentShader
		} );

		addResolutionDefine( material );

		return material;

	}

	const createRenderTarget = ( sizeXTexture, sizeYTexture, wrapS, wrapT, minFilter, magFilter ) => {
		sizeXTexture = sizeXTexture || sizeX;
		sizeYTexture = sizeYTexture || sizeY;

		wrapS = wrapS || THREE.ClampToEdgeWrapping;
		wrapT = wrapT || THREE.ClampToEdgeWrapping;

		minFilter = minFilter || THREE.NearestFilter;
		magFilter = magFilter || THREE.NearestFilter;

		const renderTarget = new THREE.WebGLRenderTarget( sizeXTexture, sizeYTexture, {
			wrapS: wrapS,
			wrapT: wrapT,
			minFilter: minFilter,
			magFilter: magFilter,
			format: THREE.RGBAFormat,
			type: ( /(iPad|iPhone|iPod)/g.test( navigator.userAgent ) ) ? THREE.HalfFloatType : THREE.FloatType,
			stencilBuffer: false,
			depthBuffer: false
		} );

		return renderTarget;
	};

	const createTexture = () => {
		const data = new Float32Array( sizeX * sizeY * 4 );
		return new THREE.DataTexture( data, sizeX, sizeY, THREE.RGBAFormat, THREE.FloatType );
	};

	const renderTexture = ( input, output ) => {
		// Takes a texture, and render out in rendertarget
		// input = Texture
		// output = RenderTarget
		passThruUniforms.passThruTexture.value = input;
		doRenderTarget( passThruShader, output );
		passThruUniforms.passThruTexture.value = null;
	};

	const doRenderTarget = ( material, output ) => {
		const currentRenderTarget = renderer.getRenderTarget();

		mesh.material = material;
		renderer.setRenderTarget( output );
		renderer.render( scene, camera );
		mesh.material = passThruShader;

		renderer.setRenderTarget( currentRenderTarget );
	};

	// Shaders
	const getPassThroughVertexShader = () => {
		return	"void main()	{\n" +
				"\n" +
				"	gl_Position = vec4( position, 1.0 );\n" +
				"\n" +
				"}\n";

	};

	const getPassThroughFragmentShader = () => {
		return	"uniform sampler2D passThruTexture;\n" +
				"\n" +
				"void main() {\n" +
				"\n" +
				"	vec2 uv = gl_FragCoord.xy / resolution.xy;\n" +
				"\n" +
				"	gl_FragColor = texture2D( passThruTexture, uv );\n" +
				"\n" +
				"}\n";

	};

	const passThruShader = createShaderMaterial( getPassThroughFragmentShader(), passThruUniforms );

	const mesh = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), passThruShader );
	scene.add( mesh );

	const base = {
		init,
		compute,
		addVariable,
		setVariableDependencies,
		createTexture,
		getCurrentRenderTarget,
	};

	return base;

};

export default GPUComputationRenderer;
