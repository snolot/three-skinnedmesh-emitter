import curl_noise from './curl_noise.js';
const mosaicComputeVelocity = `
  uniform vec3 uMouse;
  uniform float time;
  uniform sampler2D uRandomTexture;
  uniform sampler2D uOriginalTexture;

  const float maxRadius = 2.;
  const float EPS = 0.0001;
  const float gravity = -.2;

  ${curl_noise}

  vec2 rotate(vec2 v, float a) {
    float s = sin(a);
    float c = cos(a);
    mat2 m = mat2(c, -s, s, c);
    return m * v;
  }

  const float PI = 3.141592653;

  highp float random(vec2 co){
    highp float a = 12.9898;
    highp float b = 78.233;
    highp float c = 43758.5453;
    highp float dt= dot(co.xy ,vec2(a,b));
    highp float sn= mod(dt,3.14);
    return fract(sin(sn) * c);
  }

  void main(){

    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 texturePos = texture2D(texturePosition, uv);
    vec4 textureVel = texture2D(textureVelocity, uv);
    vec4 extras = texture2D(uRandomTexture, uv);
    vec3 defaultPosition = texture2D(uOriginalTexture, uv).xyz;
    vec3 pos = texturePos.xyz;
    vec3 vel = textureVel.xyz;

    float envOffset = (1.0 - extras.b);

    float posOffset = mix(extras.r, 1.0, 0.75) * (.2 + envOffset * .03);
    vec3 acc        = curl(pos * posOffset + time * .03) ;
    float speed     = 1.0 + envOffset * 2.0;

    //  rotate
    vec2 dir = normalize(pos.xz);
    dir      = rotate(dir, PI * 0.6);
    acc.xz   += dir * mix(envOffset, 1.0, .5) * .75;
    acc.y += gravity;
    vel += acc * .002 * speed;

    float dist = length(pos);
    float radius = maxRadius + envOffset * 1.0;
    
    if(dist > radius) {
      float f = pow(.0, (dist - radius) * .5) * (0.005 - envOffset * 0.002) * 1.1;
      vel -= normalize(pos) * f;
    }

    float decrease = .96 - envOffset * 0.03;
    vel *= decrease;

    gl_FragColor = vec4( vel, 1.0 );
  }
`;
        
const mosaicComputePosition = `
  uniform float time;
  uniform vec4 uMouse;
  uniform sampler2D uOriginalTexture;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 tmpPos = texture2D( texturePosition, uv );
    vec4 tmpVel = texture2D( textureVelocity, uv );
    vec4 tmpOrgPos = texture2D( uOriginalTexture, uv );

    vec3 pos = tmpPos.xyz;
    vec3 vel = tmpVel.xyz;

    float life = tmpPos.w - 0.02;
    vec3 followPos = uMouse.xyz;

    if (life < 0.0) {      
      //  tmpOrgPos *= 2.;
      pos = tmpOrgPos.xyz + (sin(time * 30.0 + life) + 0.1);// + followPos;
      life = 0.5 + fract(tmpPos.w * 21.4131 + 0.1);
    } else {
      vec3 delta = followPos * 2. - pos;
      pos += delta * 0.005;
      pos += vel;
    }

    gl_FragColor = vec4(pos, life);
  }
`;
      
const mosaicComputeOriginal = `
  uniform sampler2D pre_texturePosition;

  void main() {
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec4 q = texture2D( textureOriginal, uv );

      gl_FragColor = q;
  }
`;
        
const mosaicComputeShadow = `
  precision highp float;
  const float PackUpscale = 256. / 255.;
  const vec3 PackFactors = vec3( 256. * 256. * 256., 256. * 256.,  256. );
  const float ShiftRight8 = 1. / 256.;

  vec4 packDepthToRGBA( const in float v ) {
    vec4 r = vec4( fract( v * PackFactors ), v );
    r.yzw -= r.xyz * ShiftRight8; // tidy overflow
    return r * PackUpscale;
  }

  void main() {

    gl_FragColor = packDepthToRGBA( gl_FragCoord.z );

  }
`;

const mosaicRenderVertex = `
  precision highp float;

  attribute vec3 offset;
  attribute vec3 col;
  attribute vec2 pos_uv;
  attribute vec4 orientation;
  varying float vLife;
  varying vec2 vUv;
  varying vec2 vTuv;
  varying vec3 vCol;
  uniform sampler2D map;
  uniform mat4 shadowMatrix;
  varying vec4 vShadowCoord;
  uniform sampler2D shadowMap;
  uniform vec2 shadowMapSize;
  uniform float shadowBias;
  uniform float shadowRadius;
  uniform vec4 uMouse;
  uniform float time;
  uniform sampler2D texturePosition;
  uniform sampler2D textureVelocity;
  uniform sampler2D textureOriginal;
  varying vec4 vPosition;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vAlpha;
  uniform mat4 uMatrix;
  varying mat4 vModelMatrix;

  uniform float imgWidth;
  uniform float imgHeight;

  mat3 calcLookAtMatrix(vec3 vector, float roll) {
    vec3 rr = vec3(sin(roll), cos(roll), 0.0);
    vec3 ww = normalize(vector);
    vec3 uu = normalize(cross(ww, rr));
    vec3 vv = normalize(cross(uu, ww));

    return mat3(uu, ww, vv);
  }

  const float DEG_TO_RAD = 3.141592653589793 / 180.0;
  mat2 rotationMatrix( float a ) {
    return mat2( cos( a ), sin( a ),
            -sin( a ), cos( a ) );
  }

  const float PI = 3.141592653589793;
  uniform float near;
  uniform float far;
  uniform vec3 cameraPos;
  float fogStart = 0.1;
  float fogEnd = 30.0;
  varying float fogFactor;
  uniform float isStart;

  mat2 calcRotate2D(float _time){
    float _sin = sin(_time);
    float _cos = cos(_time);
    return mat2(_cos, _sin, -_sin, _cos);
  }

  void main() {
    vPosition = vec4(position.xyz,1.);
    vec4 posTemp = texture2D( texturePosition, pos_uv );
    vec4 velTemp = texture2D( textureVelocity, pos_uv );
    vec4 orgTemp = texture2D( textureOriginal, pos_uv );

    vec4 worldPosition = modelMatrix * vec4(posTemp.xyz, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;

    vLife = posTemp.w;
    float scale = vLife * 2. ;//10.0 / length(mvPosition.xyz) * smoothstep(0.0, 0.2, posTemp.w);

    vCol = col;
    vTuv = pos_uv;
    vAlpha = velTemp.w * .1;

    mat4 localRotationMat = mat4( calcLookAtMatrix( velTemp.xyz, 0.0 ) );

    vec2 tUv = vec2( posTemp.x/imgWidth+0.5,posTemp.y/imgHeight+0.5);
    vColor = vCol.xyz;//texture2D( map, vTuv ).xyz;

    vec3 modifiedVertex =  (localRotationMat * vec4( position*scale,1.0 )).xyz;
    vec3 modifiedPosition = (modifiedVertex + posTemp.xyz );

    if(uMouse.w == 1.0){
      float d = distance(modifiedVertex.xy + uMouse.xy, modifiedPosition.xy);

      //if(d < 2.){
        modifiedPosition += velTemp.xyz;
      //}
    }

    //modifiedPosition.yz = calcRotate2D(time) * modifiedPosition.yz;
    //modifiedPosition.xz = calcRotate2D(time) * modifiedPosition.xz;

    float linerDepth = 1.0 / (30.0 - 0.01);
    float linerPos = length(cameraPos - modifiedPosition.xyz) * linerDepth;
    fogFactor      = clamp((fogEnd - linerPos) / (fogEnd - fogStart), 0.0, 1.0);

    vPosition =  vec4( modifiedPosition, 1.0 );
    vShadowCoord = shadowMatrix * modelMatrix * vec4( vPosition.xyz, 1. );

    gl_Position = projectionMatrix * modelViewMatrix * vec4( modifiedPosition, 1.0 );

  }
`;

const mosaicRenderFragment = `
  precision highp float;
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec4 vShadowCoord;
  uniform sampler2D shadowMap;
  uniform vec2 shadowMapSize;
  uniform float shadowBias;
  uniform float shadowRadius;
  uniform float bias;

  const float UnpackDownscale = 255. / 256.; // 0..1 -> fraction (excluding 1)
  const vec3 PackFactors = vec3( 256. * 256. * 256., 256. * 256.,  256. );
  const vec4 UnpackFactors = UnpackDownscale / vec4( PackFactors, 1. );

  float unpackRGBAToDepth( const in vec4 v ) {
    return dot( v, UnpackFactors );
  }

  float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
    return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
  }

  float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {

    float shadow = 1.0;

    shadowCoord.xyz /= shadowCoord.w;
    shadowCoord.z += shadowBias;

    // if ( something && something ) breaks ATI OpenGL shader compiler
    // if ( all( something, something ) ) using this instead

    bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );
    bool inFrustum = all( inFrustumVec );

    bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );
    bool frustumTest = all( frustumTestVec );

    if ( frustumTest ) {

      vec2 texelSize = vec2( 1.0 ) / shadowMapSize;

      float dx0 = - texelSize.x * shadowRadius;
      float dy0 = - texelSize.y * shadowRadius;
      float dx1 = + texelSize.x * shadowRadius;
      float dy1 = + texelSize.y * shadowRadius;

      shadow = (
        texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
        texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
        texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
        texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
        texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
        texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
        texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
        texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
        texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
      ) * ( 1.0 / 9.0 );
    }

    return shadow;
  }
      
  vec3 rgb2hsv(vec3 c){
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsv2rgb(vec3 c){
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  varying vec4 vPosition;
  uniform sampler2D textureVelocity;
  uniform sampler2D texturePosition;
  varying vec2 vTuv;
  varying mat4 vModelMatrix;
  varying vec3 vNormal;
  uniform mat4 uMatrix;
  uniform float near;
  uniform float far;
  uniform vec3 cameraPos;
  float fogStart = 0.1;
  float fogEnd = 10.0;
  varying float fogFactor;

  vec3 calcIrradiance_dir(vec3 newNormal, vec3 lightPos, vec3 light){
      float dotNL = dot(newNormal, normalize(lightPos));
      return light * max(0.0, dotNL);
  }

  vec3 calcIrradiance_hemi(vec3 newNormal, vec3 lightPos, vec3 grd, vec3 sky){
    float dotNL = dot(newNormal, normalize(lightPos));
    float hemiDiffuseWeight = 0.5 * dotNL + 0.5;

    return mix(grd, sky, hemiDiffuseWeight);
  }

  const vec3 hemiLight_g = vec3(0.86,0.86,0.86);

  // hemisphere sky color
  const vec3 hemiLight_s_1 = vec3(0.5882352941176471,0.8274509803921568,0.8823529411764706);
  const vec3 hemiLight_s_2 = vec3(0.9686274509803922,0.8509803921568627,0.6666666666666666);
  const vec3 hemiLight_s_3 = vec3(0.8784313725490196,0.5882352941176471,0.7647058823529411);

  const vec3 hemiLightPos_1 = vec3(100.0, 100.0, -100.0);
  const vec3 hemiLightPos_2 = vec3(-100.0, -100.0, 100.0);
  const vec3 hemiLightPos_3 = vec3(-100.0, 100.0, 100.0);
  //uniform sampler2D map;

  void main() {
    vec4 velTemp = texture2D( textureVelocity, vUv );
    vec4 posTemp = texture2D( texturePosition, vTuv );
    vec3 _normal = normalize(cross(dFdx(vPosition.xyz), dFdy(vPosition.xyz)));

    vec3 hemiColor = vec3(0.0);
    hemiColor += calcIrradiance_hemi(_normal, hemiLightPos_1, hemiLight_g, hemiLight_s_1) * 0.38;
    hemiColor += calcIrradiance_hemi(_normal, hemiLightPos_2, hemiLight_g, hemiLight_s_2) * 0.26;
    hemiColor += calcIrradiance_hemi(_normal, hemiLightPos_3, hemiLight_g, hemiLight_s_3) * 0.36;
    vec3 dirColor = vec3(0.0);
    dirColor += calcIrradiance_dir(_normal, vec3(0.,0.,1.), vec3(1.));
    float shadow = 1.0;
    shadow *= getShadow(shadowMap, shadowMapSize, bias, shadowRadius, vShadowCoord);
    

    dirColor.x = max(dirColor.x,0.8);
    dirColor.y = max(dirColor.y,0.8);
    dirColor.z = max(dirColor.z,0.8);

    vec3 color = vColor.xyz*dirColor;
    color = mix(vec3(0.,0.,0.),color,fogFactor);
  
    vec3 hsv = rgb2hsv(color);
    hsv.z *= 1.3;
    color = hsv2rgb(hsv);
    color*= shadow;
    
    gl_FragColor = vec4(color,1.0);
  }
`;
    
export { mosaicComputeVelocity, mosaicComputePosition, mosaicComputeOriginal, mosaicComputeShadow, mosaicRenderVertex, mosaicRenderFragment };
