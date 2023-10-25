import * as THREE from '../libs/build/three.module.js';
import { GLTFLoader } from '../libs/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from '../libs/examples/jsm/controls/OrbitControls.js';
import { GPUComputationRenderer} from '../libs/examples/jsm/misc/GPUComputationRenderer.js';
//import Painted from './Painted.js';

import { mosaicComputeVelocity, mosaicComputePosition, mosaicComputeOriginal, mosaicComputeShadow, mosaicRenderVertex, mosaicRenderFragment } from './shaders/mosaic.js'
import curl_noise from './shaders/curl_noise.js';
import { palette2 as palette } from './palette.js';

const App = (_options) => {
	
	const BOX_SIZE_X = .12;
	const BOX_SIZE_Y = .12;
	const BOX_SIZE_Z = .12;

    const imgWidth = 150;
    const imgHeight = 100;
    
    palette.range = ["#F6D199", "#EDA65D", "#5B3B16", "#1F1408", "#AF551E", "#FEFBF5", "#546A5B"];
    //palette.range = ["#FF6D00", "#FBF8EB", "#008B99", "#F8E1A6", "#FDA81F", "#B80A01", "#480D07"]; // ["#EF2006", "#350000", "#A11104", "#ED5910", "#F1B52E", "#7B5614", "#F7F1AC"] // ["#D1D1D1", "#A9ACAE", "#101117", "#E04224", "#3D3A44", "#28B074", "#58968E"]; //["#F6D199", "#EDA65D", "#5B3B16", "#1F1408", "#AF551E", "#FEFBF5", "#546A5B"]; //["#D86618", "#E78A23", "#24110B", "#5A2511", "#A1401B", "#5F5749", "#E69958", "#E4B08E"]; //["#070707", "#B8D00D", "#FFFFFF", "#59620A", "#C6C99E", "#515343", "#78870B"];//["#665609", "#FEFEFD", "#CCCA06", "#C7C1A1", "#A19848", "#86782E", "#4F3B00"];
    //palette.range = ["#CA0045", "#052269", "#FFC068", "#114643", "#9BC2B5", "#CE8D3D", "#BD3E30"]

	const options = {
		url:'./models/brooklin.glb',
		texture: './textures/871844f8ea403e199be6858e.jpg',
		baseGeometry: new THREE.BoxBufferGeometry(BOX_SIZE_X, BOX_SIZE_Y, BOX_SIZE_Z),
		pw:128,
		ph:128,
	};


	Object.assign(options, _options);

	const TEXTURE_WIDTH = options.pw;
    const TEXTURE_HEIGHT = options.ph;

    const AMOUNT = TEXTURE_WIDTH * TEXTURE_HEIGHT;

	const loader = new GLTFLoader();
	const clock = new THREE.Clock();
	const dummy = new THREE.Object3D();

	let camera, scene, renderer;
	let model, animations, mesh, controls;

	let gpuCompute;
	let velocityVariable, positionVariable, originalVariable
	let uniforms, originalUniforms, velocityUniforms, positionUniforms

	let material, shadowMaterial
	let light, shadowCamera

	let rotateVec = new THREE.Vector3(0,0,0);
	let isRotate = false;
	let timer = 0.0;
	let cameraStartZ = 100;
	let startTimer = 0.8;
	let enableInfo = true;
	let lastTime = 0;
	
	let uid;
	let mixer;

	let skinnedMesh, geometry;
	let skeleton;
	let bindMatrix;
	let bindMatrixInverse;
	let pa;	
	let skinIndex;
	let skinWeights;
	let action;

	let offsetAttribute, livesAttribute, orientationAttribute;

	const texture = new THREE.TextureLoader().load(options.texture);
	let originalTexture, randomTexture;

	const position = new THREE.Vector3();
	const transformed = new THREE.Vector3();
	const temp1 = new THREE.Vector3();
	const tempBoneMatrix = new THREE.Matrix4();
	const tempSkinnedVertex = new THREE.Vector3();
	const tempSkinned = new THREE.Vector3();
	const currentM = new THREE.Matrix4();
	const touch = !!('ontouchstart' in window)

	let ray = new THREE.Ray()
    let mouse3d = ray.origin
    let mouse = new THREE.Vector2()
    let touched = false
    //let painted;

    const bindEvents = () => {
	    const touchBegan = touch ? 'touchstart' : 'mousedown'
	    const touchMoved = touch ? 'touchmove' : 'mousemove'
	    const touchEnded = touch ? 'touchend' : 'mouseup'
	    document.addEventListener(touchBegan, onTouchBegan)
	    window.addEventListener(touchMoved, onTouchMoved)
	    document.addEventListener(touchEnded, onTouchEnded)
	    window.addEventListener('resize', setSize, false)
	  }

	const updateMouse3D = _ => {
		camera.updateMatrixWorld()
    	ray.origin.setFromMatrixPosition(camera.matrixWorld)
    	ray.direction.set(mouse.x, mouse.y, 0.5).unproject(camera).sub(ray.origin).normalize()
    	const distance = ray.origin.length() / Math.cos(Math.PI - ray.direction.angleTo(ray.origin))
    	ray.origin.add(ray.direction.multiplyScalar(distance * 1.0))
	};

	const onTouchBegan = e => { 

		touched = true;
	};

	const onTouchMoved = e => {
	    const x = touch ? e.changedTouches[0].pageX : e.pageX
	    const y = touch ? e.changedTouches[0].pageY : e.pageY
	    mouse.x = (x / window.innerWidth) * 2 - 1
	    mouse.y = -(y / window.innerHeight) * 2 + 1
	};

	const onTouchEnded = e => { 

		touched = false;	
	};

	const setSize = _ => {
	    const w = window.innerWidth
	    const h = window.innerHeight
	    renderer.setSize(w, h)
	    camera.aspect = w / h;
	    camera.updateProjectionMatrix()
	};

	const init3D = () => {
		camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, .1, 1000);
		camera.position.x = 30;
		camera.position.z = 40;
		camera.position.y = 30;
		scene = new THREE.Scene();

		renderer = new THREE.WebGLRenderer({
			antialias: false,
		});

		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setClearColor(0x111111)
	    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
			renderer.outputEncoding = THREE.sRGBEncoding;
			renderer.toneMapping = THREE.ACESFilmicToneMapping;
			renderer.shadowMap.enabled = true;
	    //painted = Painted(renderer);

	    scene.add(dummy);
	    controls = new OrbitControls(camera,renderer.domElement);
	    controls.target = new THREE.Vector3(0,10,0);
	    controls.update();

		document.body.appendChild(renderer.domElement);
	};

	const random = function (min, max) { 

		return min + Math.random() * (max - min);	
	};

	const fillTextures = ( texturePosition, textureVelocity, textureQuaternion ) => {
    	const posArray = texturePosition.image.data;
    	const velArray = textureVelocity.image.data;
    	const qtArray = textureQuaternion.image.data;
   		const ots = originalTexture.image.data;
		const extras = randomTexture.image.data;
		//const cols = [];

   		const currentPositions = getOriginalPositions();
   		//console.log(currentPositions);

   		let a = 0;

    	for ( let k = 0, kl = posArray.length; k < kl; k += 4 ) {
	        // Position
	        let x, y, z;

	        x = Math.random()*imgWidth-imgWidth/2;
	        y = Math.random()*imgHeight-imgHeight/2;
	        z = Math.random()*10-5;

	        //cols[ k ] = palette.range[Math.floor(Math.random() * palette.range.length)];

	        posArray[ k + 0 ] = x;
	        posArray[ k + 1 ] = y;
	        posArray[ k + 2 ] = z;
	        posArray[ k + 3 ] = Math.random();

	        ots[ k + 0 ] = x;
	        ots[ k + 1 ] = y;
	        ots[ k + 2 ] = z;
	        ots[ k + 3 ] = Math.random();

	        qtArray[ k + 0 ] = x;
	        qtArray[ k + 1 ] = y;
	        qtArray[ k + 2 ] = z;
	        qtArray[ k + 3 ] = 0;

	        velArray[ k + 0 ] = random(-10, 10);
	        velArray[ k + 1 ] = random(-10, 10);
	        velArray[ k + 2 ] = random(-10, 10);
	        velArray[ k + 3 ] = 0.0;

	        extras[k + 0] = Math.random();
	        extras[k + 1] = Math.random();
	        extras[k + 2] = Math.random();
	        extras[k + 3] = Math.random();

	        if (a < currentPositions.length - 1) {
	        	a++;
	        } else {
	        	a = 0;
	        }
    	}
	};

	const initGPUCompute = () => {
		gpuCompute = new GPUComputationRenderer(TEXTURE_WIDTH, TEXTURE_HEIGHT, renderer);

    	const dtPosition = gpuCompute.createTexture();
    	const dtVelocity = gpuCompute.createTexture();
    	const dtOriginal = gpuCompute.createTexture();
    	
    	originalTexture = gpuCompute.createTexture();
    	randomTexture = gpuCompute.createTexture();

  		fillTextures( dtPosition, dtVelocity, dtOriginal);

    	velocityVariable = gpuCompute.addVariable( "textureVelocity", mosaicComputeVelocity, dtVelocity );
    	positionVariable = gpuCompute.addVariable( "texturePosition", mosaicComputePosition, dtPosition );
    	
    	let variables = [ positionVariable, velocityVariable ];
	    
	    gpuCompute.setVariableDependencies( velocityVariable, variables );
	    gpuCompute.setVariableDependencies( positionVariable, variables );
	    
		velocityUniforms = velocityVariable.material.uniforms
	    velocityUniforms.uMouse = {value:mouse3d};
	    velocityUniforms.time = {value:0};
	    velocityUniforms.uRandomTexture = {value:randomTexture};
	    velocityUniforms.uOriginalTexture = {value:originalTexture}
	    
	    positionUniforms = positionVariable.material.uniforms;
	    positionUniforms.uOriginalTexture = {value:originalTexture}
	    positionUniforms.uMouse = {value:mouse3d};
	    positionUniforms.time = {value:0};

    	const error = gpuCompute.init();
    	
    	if ( error !== null ) {
        	console.error( error );
    	}
	};

	const initLights = () => {
		scene.add(new THREE.AmbientLight());

	    light = new THREE.DirectionalLight( 0xFFAA55,0.5 );
	    light.position.set(0, 1, 1);
	    light.castShadow = true;
	    shadowCamera = light.shadow.camera;
	    shadowCamera.lookAt( scene.position );

	    light.shadow.matrix.set(
	        0.5, 0.0, 0.0, 0.5,
	        0.0, 0.5, 0.0, 0.5,
	        0.0, 0.0, 0.5, 0.5,
	        0.0, 0.0, 0.0, 1.0
	    );

	    light.shadow.matrix.multiply( shadowCamera.projectionMatrix );
	    light.shadow.matrix.multiply( shadowCamera.matrixWorldInverse );

	    if(light.shadow.map === null){
	        light.shadow.mapSize.x = 2048;
	        light.shadow.mapSize.y = 2048;

	        const pars = { 
	        	minFilter: THREE.NearestFilter,
	        	magFilter: THREE.NearestFilter,
	        	format: THREE.RGBAFormat 
	       	};

	        light.shadow.map = new THREE.WebGLRenderTarget( light.shadow.mapSize.x, light.shadow.mapSize.y, pars );
	    }
	};

	const getOriginalPositionsTexture = () => {
		const currentPositions = getOriginalPositions();
	
		const originalPos = originalTexture.image.data;
		//const texturePos = positionVariable.initialValueTexture.image.data;
		
		let a = 0;

    	for ( let k = 0, kl = originalPos.length; k < kl; k += 4 ) {
    		let x, y, z;

	        x = currentPositions[a].x;//Math.random()*imgWidth-imgWidth/2;
	        y = currentPositions[a].y;//Math.random()*imgHeight-imgHeight/2;
	        z = currentPositions[a].z;//Math.random()*10-5;
	        //if(a===0)console.log(x,y,z);

	        originalPos[ k + 0 ] = x;
	        originalPos[ k + 1 ] = y;
	        originalPos[ k + 2 ] = z;
	        //originalPos[ k + 3 ] = originalPos[ k + 3 ];

	        if (a < currentPositions.length - 1) {
	        	a++;
	        } else {
	        	a = 0;
	        }
    	}

    	originalTexture.needsUpdate = true;
		
		return originalTexture;	
	};

	const getOriginalPositions = () => {
		scene.updateMatrixWorld()
		skeleton.update()
		
		let transformedPos = [];

		for (let vndx = 0; vndx < skinnedMesh.geometry.attributes.position.count; ++vndx) {
			position.set(pa[(3 * vndx) + 0], pa[(3 * vndx) + 1], pa[(3 * vndx) + 2]);
			transformed.copy(position);
			
			tempSkinnedVertex.copy(transformed).applyMatrix4(bindMatrix);
			tempSkinned.set(0, 0, 0);

			for (let i = 0; i < 4; ++i) {
			  	const boneNdx = skinIndex.array[(4 * vndx) + i];
			  	const weight = skinWeights.array[(4 * vndx) + i];
			  	tempBoneMatrix.fromArray(skeleton.boneMatrices, boneNdx * 16);
			  	temp1.copy(tempSkinnedVertex);
			  	tempSkinned.add(temp1.applyMatrix4(tempBoneMatrix).multiplyScalar(weight));
			}

			transformed.copy(tempSkinned).applyMatrix4(bindMatrixInverse);
			transformed.applyMatrix4(skinnedMesh.matrixWorld);
			//transformed.multiplyScalar(10);
				
			dummy.position.copy(transformed);

			dummy.updateMatrix();

			transformedPos.push(new THREE.Vector3().setFromMatrixPosition(dummy.matrix));
		}
		
		return transformedPos;
	};

	const initGeometry = () => {
  		let instances = AMOUNT;
  		console.log(AMOUNT);

    	let bufferGeometry = options.baseGeometry;
	    // copying data from a simple box geometry, but you can specify a custom geometry if you want
	    geometry = new THREE.InstancedBufferGeometry();
	    geometry.index = bufferGeometry.index;
	    geometry.attributes.position = bufferGeometry.attributes.position;
	    geometry.attributes.uv = bufferGeometry.attributes.uv;
	    geometry.attributes.normal = bufferGeometry.attributes.normal;

	    let offsets = [];
	    let pos_uv = [];
	    let lives = [];
	    let orientations = [];
	    let vector = new THREE.Vector4();
	    let x, y, z, w;

	    let uvs = new Float32Array( AMOUNT * 2 );
	    let xywidth = new Float64Array( 3 );
	    xywidth[2] = TEXTURE_WIDTH;
	    let p = 0;

	    for ( let j = 1; j < TEXTURE_WIDTH; j++ ) {
	        for ( let i = 1; i < TEXTURE_HEIGHT; i++ ) {
	            xywidth[0] = i;
	            xywidth[1] = j;
	            uvs[ p++ ] = xywidth[0] / ( xywidth[2] )-(1.0/xywidth[2]);
	            uvs[ p++ ] = xywidth[1] / ( xywidth[2] )-(1.0/xywidth[2]);
	        }
	    }

	    const cols = [];
	
	    for ( let i = 0; i < instances; i ++ ) {
	    	const c = new THREE.Color(palette.range[Math.floor(Math.random() * palette.range.length)]);
	        //console.log(c);
	        cols[ i * 3 + 0 ] = c.r;
	        cols[ i * 3 + 1 ] = c.g;
	        cols[ i * 3 + 2 ] = c.b;
	        // offsets
	        /*x = Math.random() * 50 - 25;
	        y = Math.random() * 50 - 25;
	        z = Math.random() * 0;

	        vector.set( x, y, z, 0 ).normalize();
	        vector.multiplyScalar( 5 ); // move out at least 5 units from center in current direction
	        offsets.push( x + vector.x, y + vector.y, z + vector.z, i );

	        x = Math.random() * 2 - 1;
	        y = Math.random() * 2 - 1;
	        z = Math.random() * 2 - 1;
	        w = Math.random() * 2 - 1;
	        vector.set( x, y, z, w ).normalize();
	        orientations.push( vector.x, vector.y, vector.z, vector.w );*/
	        //lives.push(Math.random());
	    }
    	
    	//livesAttribute = new THREE.InstancedBufferAttribute( new Float32Array( lives ), 1 );
    	//offsetAttribute = new THREE.InstancedBufferAttribute( new Float32Array( offsets ), 4 );
    	//orientationAttribute = new THREE.InstancedBufferAttribute( new Float32Array( orientations ), 4 ).setUsage( THREE.DynamicDrawUsage );

	    texture.wrapS = THREE.ClampToEdgeWrapping;
    	texture.wrapT = THREE.ClampToEdgeWrapping;

    	let pos_uvsAttribute = new THREE.InstancedBufferAttribute( uvs, 2 );
    	let colAttribute = new THREE.InstancedBufferAttribute( new Float32Array(cols), 3 );

    	//geometry.setAttribute( 'offset', offsetAttribute );
    	//geometry.setAttribute( 'orientation', orientationAttribute );
    	geometry.setAttribute( 'pos_uv', pos_uvsAttribute );
    	geometry.setAttribute( 'col', colAttribute );
    	
    	// material
	    uniforms = {
	        map: { value: texture},
	        time:{value:0.0},
	        texturePosition:{value:null},
	        textureVelocity:{value:null},
	        textureOriginal:{value:null},
	        shadowMap: { type: 't', value: light.shadow.map },
	        shadowMapSize: {type: "v2", value: light.shadow.mapSize},
	        shadowBias: {type: "f", value: light.shadow.bias},
	        shadowRadius: {type: "f", value: light.shadow.radius},
	        uMatrix:{value:null},
	        uMouse:{value:new THREE.Vector4()},
	        imgWidth:{value:imgWidth},
	        imgHeight:{value:imgHeight},
	        near:{value:camera.near},
	        far:{value:camera.far},
	        cameraPos:{value:camera.position},
	        sceneInvMatrix:{value:null},
	        isStart:{value:startTimer}
	    };
    
    	material = new THREE.ShaderMaterial( {
	        uniforms: uniforms,
	        vertexShader: mosaicRenderVertex,
	        fragmentShader: mosaicRenderFragment,	        
	        transparent:true
	    } );

    	shadowMaterial = new THREE.ShaderMaterial( {
	        uniforms: {
	            map: { value: texture},
	            time:{value:0.0},
	            texturePosition:{value:null},
	            textureVelocity:{value:null},
	            size: { type: "f", value: TEXTURE_WIDTH },
	            timer: { type: 'f', value: 0 },
	            shadowMatrix: { type: 'm4', value: light.shadow.matrix},
	            lightPosition: { type: 'v3', value: light.position }
	        },
	        vertexShader: mosaicRenderVertex,
	        fragmentShader: mosaicComputeShadow,
	    });

	    mesh = new THREE.Mesh( geometry, material );
	    mesh.frustumCulled = false;

	    scene.add( mesh );
  	};

	const init = async () => {
		return new Promise(resolve => {
			init3D();
			initLights();
			
			loader.load(options.url, gltf => {
				model = gltf.scene;
				animations = gltf.animations;

				model.traverse(child => {
					console.log(child)
					if (child.isSkinnedMesh/* && child.name === 'Object_11'*/) {
						skinnedMesh = child;

						skeleton = skinnedMesh.skeleton;
						bindMatrix = skinnedMesh.bindMatrix;
						bindMatrixInverse = skinnedMesh.bindMatrixInverse;
						pa = skinnedMesh.geometry.attributes.position.array;	
						skinIndex = skinnedMesh.geometry.attributes.skinIndex;
						skinWeights = skinnedMesh.geometry.attributes.skinWeight;
						
						mixer = new THREE.AnimationMixer(skinnedMesh);
						console.log(child.name);
						// if(child.name === 'Alpha_Surface'){
							//console.log(child.material);
							child.material.color = new THREE.Color().setHex(0x333333)
							//child.material.emissive = new THREE.Color().setHex(0xFFFFFF)
							child.material.transparent = true;
							//child.material.opacity = 0;
							//child.material.map = new THREE.TextureLoader().load('./textures/BaseColor.png');
							child.material.wireframe = true;
						// }
						action = mixer.clipAction(animations[0]);
						action.play()
						scene.add(model);
						model.scale.set(20,20,20);

						initGPUCompute();
						initGeometry();
						bindEvents();

						resolve(true);
					}
				});
			});
		});
	};

	const start = () => {
		action.play();
		update();
	};

	const update = () => {
		uid = requestAnimationFrame(update);

		const time = clock.getElapsedTime()
  		const delta = clock.getDelta()

	  	if(startTimer > 0){
	        startTimer -=0.008
	    } else {
	        uniforms.isStart.value = startTimer
	        isRotate = true
	    }

	    updateMouse3D()

	    if(uniforms){
			uniforms.uMouse.value.set(mouse3d.x, mouse3d.y, mouse3d.z, touched ? 1.0 : 0.0);
		}

	    scene.rotation.setFromVector3(rotateVec)

	    getOriginalPositionsTexture();

	    positionVariable.material.uniforms.needsUpdate = true;
	    velocityVariable.material.uniforms.time.value = timer;
	    velocityVariable.material.uniforms.uMouse.value = mouse3d;	    
	    velocityVariable.material.uniforms.uOriginalTexture.value = getOriginalPositionsTexture();
		gpuCompute.compute()
	   
	    uniforms.textureVelocity.value = gpuCompute.getCurrentRenderTarget( velocityVariable ).texture

	    shadowMaterial.uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget( positionVariable ).texture
	    shadowMaterial.uniforms.textureVelocity.value = gpuCompute.getCurrentRenderTarget( velocityVariable ).texture
	    shadowMaterial.uniforms.time.value = timer

	    lastTime = timer

	    mesh.material = shadowMaterial;

	    renderer.setRenderTarget(light.shadow.map)
		renderer.render( scene, shadowCamera);
		renderer.setRenderTarget(null)
		
		if (mixer) {
			mixer.update(.008);
			//console.log(mixer.time);
		}

	    mesh.material = material;
	    
	    uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget( positionVariable ).texture
	    uniforms.textureOriginal.value = getOriginalPositionsTexture();//gpuCompute.getCurrentRenderTarget( originalVariable ).texture
	    uniforms.textureOriginal.needsUpdate = true;
	    uniforms.time.value = timer;
	    uniforms.needsUpdate = true;
	    uniforms.shadowMap.value = light.shadow.map.texture

	    let m = new THREE.Matrix4();
	    material.uniforms.uMatrix.value = m.copy(mesh.matrix).invert();

		renderer.render(scene, camera);
		//painted.render(scene, camera);
	};

	const base = {
		init,
		start,
		update,
	};

	return base;
}

export default App;
