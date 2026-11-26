import type { OrbitView } from "@/content/willis-tower";
import type { getRiverEnvironment } from "./atlas-river-environment";

type RiverEnvironment = ReturnType<typeof getRiverEnvironment>;

type Vec = readonly [number, number, number];
export type RiverPan = readonly [east: number, south: number];
export type RiverGuide = { point: RiverPan; progress: number; orbitOrigin?: OrbitView };
export const RIVER_CENTER: RiverPan = [0, 0];

export const RIVER_WILLIS = [-282.44, 234, 657.10] as const;
export const RIVER_MARINA = [305.9, 85, -364.6] as const;

export function riverCamera(view: OrbitView, target: Vec, aspect: number, pan: RiverPan = RIVER_CENTER, guide?: RiverGuide) {
	const willis = target === RIVER_WILLIS;
	const ride = Math.min(1, Math.max(0, guide?.progress ?? 0));
	const eased = ride * ride * (3 - 2 * ride);
	// A stable diagonal view emphasizes the buildings and keeps both subway legs in context.
	const yaw = guide?.orbitOrigin ? view.yaw - guide.orbitOrigin.yaw : 0;
	const pitch = guide?.orbitOrigin ? (view.pitch - guide.orbitOrigin.pitch) * .85 : 0;
	const heading = ((view.yaw + (willis ? 28 : 115)) * (1 - eased) + (yaw - 33) * eased) * Math.PI / 180;
	const tilt = Math.min(83, (view.pitch * .85 - (willis ? 6 : 17)) * (1 - eased) + (56 + pitch) * eased) * Math.PI / 180;
	const cosTilt = Math.cos(tilt);
	const rideZoom = guide?.orbitOrigin ? view.zoom : 1;
	const distance = (((willis ? 740 : 230) / view.zoom) * (1 - eased) + 465 * eased / rideZoom) * Math.max(1, .72 / aspect);
	const focusX = target[0] * (1 - eased) + (guide?.point[0] ?? target[0]) * eased;
	const focusY = target[1] * (1 - eased) + 36 * eased;
	const focusZ = target[2] * (1 - eased) + (guide?.point[1] ?? target[2]) * eased;
	const back: Vec = [Math.sin(heading) * cosTilt, Math.sin(tilt), Math.cos(heading) * cosTilt];
	const right: Vec = [Math.cos(heading), 0, -Math.sin(heading)];
	const up: Vec = [back[1] * right[2], cosTilt, -back[1] * right[0]];
	const panWeight = guide?.orbitOrigin ? 1 : 1 - eased;
	const eye: Vec = [
		focusX + pan[0] * panWeight + back[0] * distance,
		focusY + back[1] * distance,
		focusZ + pan[1] * panWeight + back[2] * distance,
	];
	const scale = .50;
	const shift = aspect > 1.6 ? -.27 : 0;
	const focal = [aspect * scale, scale] as const;
	const depthOf = (point: Vec) => -(point[0] - eye[0]) * back[0] - (point[1] - eye[1]) * back[1] - (point[2] - eye[2]) * back[2];
	const project = (point: Vec) => {
		const x = point[0] - eye[0], y = point[1] - eye[1], z = point[2] - eye[2];
		const depth = depthOf(point);
		return [
			.5 + .5 * ((x * right[0] + y * right[1] + z * right[2]) / (focal[0] * depth) + shift),
			.5 - .5 * (x * up[0] + y * up[1] + z * up[2]) / (focal[1] * depth),
		];
	};
	return { eye, right, up, back, focal, shift, project, depthOf, distance, focusX, focusZ };
}

export function moveRiverPan(view: OrbitView, target: Vec, pan: RiverPan, rightMetres: number, forwardMetres: number, guide?: RiverGuide): RiverPan {
	const { right, focusX, focusZ } = riverCamera(view, target, 1, RIVER_CENTER, guide);
	const x = focusX + pan[0] + right[0] * rightMetres + right[2] * forwardMetres;
	const z = focusZ + pan[1] + right[2] * rightMetres - right[0] * forwardMetres;
	// Keep the focus inside the bundled downtown geometry.
	return [
		Math.min(1350, Math.max(-1270, x)) - focusX,
		Math.min(1470, Math.max(-1360, z)) - focusZ,
	];
}

export function riverEntryZoom(elapsed: number): number {
	const progress = Math.min(1, Math.max(0, elapsed / 950));
	return .76 + .24 * (1 - (1 - progress) ** 3);
}

const cameraUniforms = `
uniform vec3 uEye, uRight, uUp, uBack;
uniform vec2 uFocal;
uniform float uShift;
`;

const sky = `
uniform vec3 uSun, uMoon;
uniform float uDay, uTwilight, uClouds, uMoonRadius, uSunRadius;
float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
}
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f*f*(3.0-2.0*f);
	return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
vec3 atmosphere(vec3 ray) {
	float h = clamp(ray.y,0.0,1.0);
	float toSun = max(dot(ray,uSun),0.0);
	vec3 zenith = mix(vec3(.066,.10,.16),vec3(.36,.57,.76),uDay);
	vec3 horizon = mix(vec3(.17,.21,.29),vec3(.74,.82,.86),uDay);
	vec3 color = mix(horizon,zenith,pow(h,.50));
	color += uTwilight * pow(1.0-h,5.0) * mix(vec3(.11,.09,.11),vec3(.56,.30,.15),pow(toSun,3.0));
	color += (.04 + .12*uTwilight) * pow(toSun,24.0) * (1.0-uClouds*.7);
	float sun = 1.0-smoothstep(uSunRadius*.9,uSunRadius*1.12,length(ray-uSun));
	color += vec3(1.0,.88,.64)*sun*step(0.0,uSun.y)*(1.0-uClouds*.88);
	float lunar = length(ray-uMoon)/uMoonRadius;
	if (lunar < 1.04 && uMoon.y > 0.0) {
		vec3 offset = (ray-uMoon*dot(ray,uMoon))/uMoonRadius;
		vec3 lunarNormal = offset-uMoon*sqrt(max(0.0,1.0-dot(offset,offset)));
		float light = smoothstep(-.025,.07,dot(lunarNormal,uSun));
		color = mix(color,vec3(.83,.87,.91),light*(1.0-smoothstep(.91,1.04,lunar))*(1.0-uClouds*.94));
	}
	if (uClouds > .02 && h > .008) {
		vec2 p = ray.xz/(.15+h)*vec2(2.9,4.0);
		float field = noise(p)*.63 + noise(p*2.11)*.26 + noise(p*4.24)*.11;
		float opacity = smoothstep(.88-uClouds*.82,1.01-uClouds*.70,field);
		vec3 cloud = mix(vec3(.12,.15,.21),vec3(.68,.73,.77),uDay);
		cloud += uTwilight*pow(toSun,3.0)*vec3(.22,.11,.06);
		color = mix(color,cloud,opacity*smoothstep(.008,.08,h));
	}
	return color;
}
`;

const skyVertex = `
attribute vec2 aPosition;
varying vec2 vScreen;
void main() {
	vScreen = aPosition;
	gl_Position = vec4(aPosition,1.0,1.0);
}
`;

const skyFragment = `
precision highp float;
varying vec2 vScreen;
uniform float uReflection;
${cameraUniforms}
${sky}
void main() {
	vec3 ray = normalize(uRight*(vScreen.x-uShift)*uFocal.x+uUp*vScreen.y*uFocal.y-uBack);
	if (uReflection > .5) ray.y = -ray.y;
	vec3 color = atmosphere(ray);
	if (uReflection < .5 && ray.y < -.0001) {
		float distanceToGround = (-6.0-uEye.y)/ray.y;
		vec3 distantGround = vec3(.33,.35,.34)*(.43+.27*uDay+.17*uTwilight);
		color = mix(distantGround,color,smoothstep(0.0,4800.0,distanceToGround));
	}
	gl_FragColor = vec4(color,1.0);
}
`;

const shadowSpace = `
uniform vec3 uLightRight, uLightUp;
vec3 shadowSpace(vec3 position, vec3 sunDirection) {
	return vec3(dot(position,uLightRight)/2200.0+.5,
		dot(position,uLightUp)/2200.0+.5,.5-dot(position,sunDirection)/4500.0);
}
`;

const shadowVertex = `
attribute vec3 aPosition;
attribute vec2 aStyle;
uniform vec3 uSun;
varying float vMaterial, vDepth;
${shadowSpace}
void main() {
	vec3 point = shadowSpace(aPosition,uSun);
	gl_Position = vec4(point*2.0-1.0,1.0);
	vDepth = point.z;
	vMaterial = aStyle.x;
}
`;

const shadowFragment = `
precision highp float;
varying float vMaterial, vDepth;
uniform float uLeaf;
void main() {
	if (vMaterial == 4.0 || vMaterial == 8.0 || vMaterial == 9.0 || (vMaterial == 5.0 && uLeaf < .2)) discard;
	vec3 encoded = fract(vDepth*vec3(1.0,255.0,65025.0));
	encoded -= vec3(encoded.yz/255.0,0.0);
	gl_FragColor = vec4(encoded,1.0);
}
`;

const worldVertex = `
attribute vec3 aPosition, aNormal;
attribute vec2 aStyle;
varying vec3 vPosition, vNormal;
varying vec2 vStyle;
uniform float uReflection;
${cameraUniforms}
void main() {
	vec3 point = aPosition;
	if (uReflection > .5) point.y = -10.0-point.y;
	vec3 local = point-uEye;
	float depth = -dot(local,uBack);
	gl_Position = vec4(dot(local,uRight)/uFocal.x+uShift*depth,dot(local,uUp)/uFocal.y,1.0008*depth-4.0016,depth);
	vPosition = aPosition;
	vNormal = aNormal;
	vStyle = aStyle;
}
`;

const worldFragment = (derivatives: boolean) => `
${derivatives ? "#extension GL_OES_standard_derivatives : enable" : ""}
precision highp float;
varying vec3 vPosition, vNormal;
varying vec2 vStyle;
uniform vec3 uEye, uMastLow, uMastHigh;
uniform vec2 uResolution;
uniform float uReflection, uNight, uVisibility, uWind, uTime, uWet, uSnow, uLeaf, uAutumn;
uniform sampler2D uMirror, uShadow;
uniform vec2 uWindDirection;
${sky}
${shadowSpace}
float sunshine(vec3 position, vec3 normal, float direct) {
	if (uSun.y < .04 || direct < .035) return 0.0;
	vec3 samplePoint = shadowSpace(position+normal*1.75,uSun);
	if (samplePoint.x < .002 || samplePoint.x > .998 || samplePoint.y < .002 || samplePoint.y > .998) return direct;
	float shade = 0.0;
	for (int x = 0; x <= 1; x++) {
		for (int y = 0; y <= 1; y++) {
			vec2 offset = (vec2(float(x), float(y))-.5)/1024.0;
			vec3 packedDepth = texture2D(uShadow,samplePoint.xy+offset).rgb;
			shade += step(samplePoint.z-.00037,dot(packedDepth,vec3(1.0,1.0/255.0,1.0/65025.0)));
		}
	}
	return direct*(.20+.20*shade);
}
void main() {
	float mat = floor(vStyle.x+.5), seed = vStyle.y;
	vec3 eyeRay = normalize(vPosition-uEye);
	float range = length(vPosition-uEye);
	vec3 normal = normalize(vNormal);
	float ambient = .43+.27*uDay+.17*uTwilight;
	float lit = max(dot(normal,uSun),0.0)*uDay*(1.0-uClouds*.72);
	vec3 surface = vec3(.35,.36,.36);
	vec3 emit = vec3(0);
	if (mat == 4.0) {
		if (uReflection > .5) discard;
		vec2 p = vPosition.xz;
		float wave = sin(dot(p,uWindDirection)*.29+uTime*(.75+uWind*.8))*.55
			+ sin(p.y*.47-p.x*.12-uTime*.83)*.31;
		float small = sin(p.x*.97+p.y*.46-uTime*1.32)*.14;
		vec2 uv = gl_FragCoord.xy/uResolution+vec2((wave+small)*.008,wave*.004)*(1.0+uWind);
		vec3 reflected = texture2D(uMirror,clamp(uv,0.002,.998)).rgb;
		float grazing = pow(1.0-abs(eyeRay.y),2.0);
		vec3 water = mix(vec3(.045,.097,.121),vec3(.24,.36,.36),uDay);
		water += vec3(.06,.083,.083)*wave*.16;
		water = mix(water,reflected,.24+.55*grazing);
		gl_FragColor = vec4(water,1.0);
		return;
	}
	if (mat == 8.0 && uReflection > .5) discard;
	if (mat == 0.0) surface = mix(vec3(.27,.29,.30),vec3(.54,.52,.48),seed);
	if (mat == 7.0) surface = mix(vec3(.24,.24,.25),vec3(.47,.42,.36),seed);
	if (mat == 9.0) surface = vec3(.48,.44,.38);
	if (mat == 8.0) surface = mix(vec3(.33,.35,.34),vec3(.53,.51,.45),seed);
	if (mat == 10.0) surface = vec3(.65,.61,.53)*(.91+.09*seed);
	if (mat == 11.0) surface = vec3(.27,.25,.23);
	if (mat == 12.0) surface = vec3(.32,.33,.32)*(.83+.25*seed);
	if (mat == 15.0) surface = vec3(.066,.076,.080);
	if (mat == 13.0) {
		surface = mix(vec3(.12,.16,.18),vec3(.34,.38,.40),uDay*.55);
		float cell = hash(vec2(floor(vPosition.y/2.8),floor((vPosition.x+vPosition.z)/4.0)));
		emit = vec3(.68,.47,.27)*step(.72,cell)*uNight*.46;
	}
	if (mat == 14.0) {
		float wallCoordinate = abs(normal.x) > .5 ? vPosition.z-622.81 : vPosition.x+316.73;
		vec2 window = vec2(wallCoordinate / 3.81,(vPosition.y+6.0)/4.019);
		vec2 pane = fract(window);
		float cell = hash(floor(window)+vec2(vPosition.x+vPosition.z)*.0001);
		vec2 edge = min(pane,1.0-pane);
		vec2 softness = ${derivatives ? "clamp(fwidth(window)*.64,vec2(.014),vec2(.32))" : "vec2(.045)"};
		vec2 glass = smoothstep(vec2(.035,.08)-softness,vec2(.035,.08)+softness,edge);
		float glazing = glass.x*glass.y;
		float grazing = pow(1.0-abs(dot(normal,eyeRay)),2.0);
		vec3 paneColor = mix(vec3(.090,.117,.139),vec3(.238,.280,.292),uDay*.48+grazing*.31);
		surface = mix(vec3(.054,.065,.070),paneColor,glazing)*(.96+.11*cell);
		emit = vec3(.77,.49,.23)*glazing*step(.83,cell)*uNight*.66;
	}
	if (mat == 1.0 || mat == 2.0 || mat == 3.0) {
		float along = mix(vPosition.x,vPosition.z,abs(normal.x));
		vec2 window = vec2(along/(mat==2.0 ? 3.8 : 2.9),vPosition.y/3.88);
		float detail = 1.0-smoothstep(390.0,1690.0,range);
		vec2 pane = fract(window);
		vec2 soft = ${derivatives ? "clamp(fwidth(window)*.72,vec2(.015),vec2(.38))" : "vec2(.05)"};
		vec2 inset = min(pane,1.0-pane);
		vec2 paneMask = smoothstep(vec2(.055,.084)-soft,vec2(.055,.084)+soft,inset);
		float mullion = (1.0-paneMask.x*paneMask.y)*detail;
		float column = hash(floor(window)+seed*53.19);
		if (mat == 2.0) {
			vec3 stone = mix(vec3(.48,.47,.44),vec3(.74,.67,.56),seed);
			surface = mix(vec3(.31,.36,.37),stone,.78-mullion*.22);
		} else if (mat == 3.0) {
			surface = mix(vec3(.135,.157,.176),vec3(.28,.31,.32),.27+.36*max(normal.z,0.0));
			float band = max(1.0-smoothstep(2.0,4.0,abs(vPosition.y-197.0)),1.0-smoothstep(2.0,4.0,abs(vPosition.y-349.0)));
			surface *= 1.0-band*.36;
		} else {
			surface = mix(vec3(.28,.36,.42),vec3(.53,.61,.62),seed);
			surface += vec3(.08,.12,.15)*max(normal.z,0.0);
		}
		surface *= 1.0-.22*mullion+.044*(column-.5)*detail;
		emit = (vec3(.70,.44,.22)+vec3(.18,.23,.24)*step(.88,column))*uNight
			*step(.77,column)*(1.0-mullion)*(.14+.58*detail);
	}
	if (mat >= 16.0 && mat <= 21.0) {
		float along = mix(vPosition.x,vPosition.z,abs(normal.x));
		vec2 window = vec2(along/3.6,(vPosition.y+6.0)/3.7);
		vec2 pane = fract(window);
		vec2 edge = min(pane,1.0-pane);
		vec2 soft = ${derivatives ? "clamp(fwidth(window)*.62,vec2(.018),vec2(.28))" : "vec2(.06)"};
		vec2 border = vec2(.12,.16);
		if (mat == 16.0 || mat == 18.0 || mat == 20.0) border = vec2(.27,.23);
		vec2 inset = smoothstep(border-soft,border+soft,edge);
		float paneArea = inset.x*inset.y;
		vec3 face = vec3(.70,.66,.58);
		vec3 glass = vec3(.28,.36,.39);
		if (mat == 17.0) { face = vec3(.14,.15,.15); glass = vec3(.18,.23,.24); }
		if (mat == 18.0) { face = mix(vec3(.36,.23,.16),vec3(.60,.42,.34),seed); glass = vec3(.21,.23,.23); }
		if (mat == 19.0) { face = vec3(.45,.54,.53); glass = vec3(.22,.47,.49); }
		if (mat == 20.0) {
			face = mix(vec3(.13,.21,.19),vec3(.78,.75,.70),smoothstep(3.0,4.1,vPosition.y));
			glass = vec3(.26,.31,.33);
		}
		if (mat == 21.0) {
			face = vec3(.67,.38,.33);
			glass = vec3(.31,.55,.68);
			paneArea = max(.62,paneArea);
		}
		surface = mix(face,glass*(.92+.10*max(normal.z,0.0)),paneArea);
		float cell = hash(floor(window)+seed*59.0);
		emit = vec3(.73,.46,.22)*uNight*paneArea*step(.83,cell)*.39;
	}

	if (mat == 5.0) {
		vec3 summer = mix(vec3(.29,.36,.22),vec3(.40,.47,.29),seed);
		vec3 fall = mix(vec3(.52,.33,.19),vec3(.70,.54,.26),seed);
		surface = mix(vec3(.36,.32,.28),mix(summer,fall,uAutumn),uLeaf);
	}
	if (mat == 6.0) {
		surface = vec3(.62,.60,.53);
		emit = mix(uMastLow,uMastHigh,smoothstep(449.0,524.0,vPosition.y))*uNight*.9;
	}
	float snow = uSnow*smoothstep(.38,.98,normal.y)*(mat == 6.0 ? 0.0 : .81);
	surface = mix(surface*(1.0-uWet*.19),vec3(.83,.87,.89),snow);
	vec3 color = surface * (ambient + sunshine(vPosition,normal,lit)*.60) + emit;
	float fog = 1.0-exp(-range/(4100.0*max(.14,uVisibility)));
	vec3 air = mix(vec3(.17,.21,.29),vec3(.74,.82,.86),uDay) + uTwilight*vec3(.17,.075,.033);
	gl_FragColor = vec4(mix(color,air,fog*.63),1.0);
}
`;

const weatherFragment = `
precision mediump float;
varying vec2 vScreen;
uniform vec2 uResolution;
uniform float uPrecip, uTime, uWind, uNight;
float hash(vec2 p) { return fract(sin(dot(p,vec2(19.3,73.6)))*4791.613); }
void main() {
	vec2 pos = vScreen*vec2(uResolution.x/uResolution.y,1.0);
	bool snow = uPrecip > 1.5;
	pos.x += snow ? -uTime*(.022+.04*uWind) : (pos.y+uTime*.26)*(.18+uWind*.25);
	pos.y += uTime*(snow ? .104 : 1.98);
	vec2 grid = pos*vec2(snow ? 36.0 : 66.0,snow ? 36.0 : 16.0);
	float seed = hash(floor(grid));
	vec2 local = fract(grid)-vec2(.2+.6*seed,.5);
	float drop = snow ? 1.0-smoothstep(.025,.092,length(local)) :
		(1.0-smoothstep(.018,.045,abs(local.x)))*(1.0-smoothstep(.02,.42,abs(local.y)));
	gl_FragColor = vec4(vec3(.87,.92,.96),drop*step(snow ? .74 : .72,seed)*(snow ? .61 : .28)*(.78+.22*uNight));
}
`;

function shaderProgram(gl: WebGLRenderingContext, vertex: string, fragment: string) {
	const compile = (kind: number, code: string) => {
		const shader = gl.createShader(kind)!;
		gl.shaderSource(shader, code);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader) ?? "Shader compilation failed");
		return shader;
	};
	const program = gl.createProgram()!;
	const vert = compile(gl.VERTEX_SHADER, vertex);
	const frag = compile(gl.FRAGMENT_SHADER, fragment);
	gl.attachShader(program, vert);
	gl.attachShader(program, frag);
	gl.linkProgram(program);
	gl.deleteShader(vert);
	gl.deleteShader(frag);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program) ?? "Shader link failed");
	const locations = new Map<string, WebGLUniformLocation | null>();
	function location(name: string) {
		if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
		return locations.get(name) ?? null;
	}
	return {
		program,
		use: () => gl.useProgram(program),
		value: (name: string, value: number) => gl.uniform1f(location(name), value),
		pair: (name: string, value: readonly [number, number]) => gl.uniform2f(location(name), ...value),
		vector: (name: string, value: Vec) => gl.uniform3f(location(name), ...value),
		sampler: (name: string, unit = 0) => gl.uniform1i(location(name), unit),
		attribute: (name: string, size: number, stride: number, offset: number) => {
			const index = gl.getAttribLocation(program, name);
			gl.enableVertexAttribArray(index);
			gl.vertexAttribPointer(index, size, gl.FLOAT, false, stride, offset);
			return index;
		},
	};
}

const color = (hex: string | undefined, fallback: Vec): Vec => hex
	? [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Vec
	: fallback;

export function mountRiverRenderer(canvas: HTMLCanvasElement, mesh: Float32Array, landmarks: Float32Array) {
	const context = canvas.getContext("webgl", { alpha: false, antialias: true, powerPreference: "low-power" });
	if (!context) return null;
	const gl: WebGLRenderingContext = context;
	const skyPass = shaderProgram(gl, skyVertex, skyFragment);
	const world = shaderProgram(gl, worldVertex, worldFragment(Boolean(gl.getExtension("OES_standard_derivatives"))));
	const weatherPass = shaderProgram(gl, skyVertex, weatherFragment);
	const shadowPass = shaderProgram(gl, shadowVertex, shadowFragment);
	const geometry = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, geometry);
	gl.bufferData(gl.ARRAY_BUFFER, mesh.byteLength + landmarks.byteLength, gl.STATIC_DRAW);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh);
	gl.bufferSubData(gl.ARRAY_BUFFER, mesh.byteLength, landmarks);
	const screen = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, screen);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	const fbo = gl.createFramebuffer();
	const depth = gl.createRenderbuffer();
	const reflection = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, reflection);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, reflection, 0);
	gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
	gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
	let mirrorWidth = 0, mirrorHeight = 0;
	const shadowFbo = gl.createFramebuffer();
	const shadowDepth = gl.createRenderbuffer();
	const shadowMap = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, shadowMap);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 1024, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowMap, 0);
	gl.bindRenderbuffer(gl.RENDERBUFFER, shadowDepth);
	gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 1024, 1024);
	gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shadowDepth);
	let lastSun = "";

	function draw(view: OrbitView, target: Vec, env: RiverEnvironment, palette: string[], time: number, snow: number, pan: RiverPan, guide?: RiverGuide) {
		const cssWidth = Math.max(1, canvas.clientWidth), cssHeight = Math.max(1, canvas.clientHeight);
		const pixelRatio = Math.min(devicePixelRatio || 1, 2, 2560 / cssWidth, Math.sqrt(3_200_000 / (cssWidth * cssHeight)));
		const width = Math.max(1, Math.round(cssWidth * pixelRatio));
		const height = Math.max(1, Math.round(cssHeight * pixelRatio));
		if (canvas.width !== width || canvas.height !== height || mirrorWidth === 0) {
			canvas.width = width;
			canvas.height = height;
			mirrorWidth = Math.ceil(width / 2);
			mirrorHeight = Math.ceil(height / 2);
			gl.bindTexture(gl.TEXTURE_2D, reflection);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mirrorWidth, mirrorHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
			gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, mirrorWidth, mirrorHeight);
		}
		const camera = riverCamera(view, target, width / height, pan, guide);
		const cloud = env.weather.cloudCover ?? .24;
		const wind = Math.min(1, (env.weather.windSpeedKmh ?? 10) / 48);
		const precip = env.weather.precipitation === "snow" || env.weather.precipitation === "mixed" ? 2 : env.weather.precipitation === "rain" ? 1 : 0;
		const weatherVisibility = env.weather.visibilityKm ?? 22;
		const windAngle = (env.weather.windFromDegrees ?? 218) * Math.PI / 180;
		const [east, up, south] = env.sun.direction;
		const lateral = Math.hypot(east, south);
		const lightRight: Vec = lateral > .001 ? [south / lateral, 0, -east / lateral] : [1, 0, 0];
		const lightUp: Vec = [up * lightRight[2], lateral, -up * lightRight[0]];
		const count = (mesh.length + landmarks.length) / 8;
		const sunKey = env.sun.direction.join(",") + env.foliage.cover;
		if (up > .04 && sunKey !== lastSun) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
			gl.viewport(0, 0, 1024, 1024);
			gl.clearColor(1, 1, 1, 1);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			gl.enable(gl.DEPTH_TEST);
			shadowPass.use();
			shadowPass.vector("uSun", env.sun.direction);
			shadowPass.vector("uLightRight", lightRight);
			shadowPass.vector("uLightUp", lightUp);
			shadowPass.value("uLeaf", env.foliage.cover);
			gl.bindBuffer(gl.ARRAY_BUFFER, geometry);
			const position = shadowPass.attribute("aPosition", 3, 32, 0);
			const style = shadowPass.attribute("aStyle", 2, 32, 24);
			gl.drawArrays(gl.TRIANGLES, 0, count);
			gl.disableVertexAttribArray(position);
			gl.disableVertexAttribArray(style);
			lastSun = sunKey;
		}
		function setView(pass: typeof world) {
			pass.vector("uEye", camera.eye);
			pass.vector("uRight", camera.right);
			pass.vector("uUp", camera.up);
			pass.vector("uBack", camera.back);
			pass.pair("uFocal", camera.focal);
			pass.value("uShift", camera.shift);
			pass.vector("uSun", env.sun.direction);
			pass.vector("uMoon", env.moon.direction);
			pass.value("uSunRadius", env.sun.angularDiameter * Math.PI / 360);
			pass.value("uMoonRadius", env.moon.angularDiameter * Math.PI / 360);
			pass.value("uDay", env.daylight);
			pass.value("uTwilight", env.twilight);
			pass.value("uClouds", cloud);
		}
		function paintScene(isReflection: boolean) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, isReflection ? fbo : null);
			gl.viewport(0, 0, isReflection ? mirrorWidth : width, isReflection ? mirrorHeight : height);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			gl.disable(gl.DEPTH_TEST);
			skyPass.use();
			setView(skyPass);
			skyPass.value("uReflection", Number(isReflection));
			gl.bindBuffer(gl.ARRAY_BUFFER, screen);
			const skyIndex = skyPass.attribute("aPosition", 2, 0, 0);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.disableVertexAttribArray(skyIndex);
			gl.enable(gl.DEPTH_TEST);
			world.use();
			setView(world);
			world.value("uReflection", Number(isReflection));
			world.value("uNight", Math.max(env.night, .64 * env.twilight));
			world.value("uVisibility", Math.max(.25, Math.min(1, weatherVisibility / 16)));
			world.value("uWind", wind);
			world.value("uTime", time);
			world.value("uWet", precip === 1 ? 1 : 0);
			world.value("uSnow", snow);
			world.value("uLeaf", env.foliage.cover);
			world.value("uAutumn", env.foliage.autumn);
			world.pair("uResolution", [width, height]);
			world.pair("uWindDirection", [-Math.sin(windAngle), Math.cos(windAngle)]);
			world.vector("uLightRight", lightRight);
			world.vector("uLightUp", lightUp);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, shadowMap);
			world.sampler("uShadow", 1);
			world.vector("uMastLow", color(palette[0], [.44, .40, .35]));
			world.vector("uMastHigh", color(palette[1] ?? palette[0], [.44, .40, .35]));
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, isReflection ? null : reflection);
			world.sampler("uMirror");
			gl.bindBuffer(gl.ARRAY_BUFFER, geometry);
			const inputs = [
				world.attribute("aPosition", 3, 32, 0),
				world.attribute("aNormal", 3, 32, 12),
				world.attribute("aStyle", 2, 32, 24),
			];
			gl.drawArrays(gl.TRIANGLES, 0, count);
			inputs.forEach((index) => gl.disableVertexAttribArray(index));
		}

		paintScene(true);
		paintScene(false);
		if (precip) {
			gl.disable(gl.DEPTH_TEST);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			weatherPass.use();
			weatherPass.pair("uResolution", [width, height]);
			weatherPass.value("uPrecip", precip);
			weatherPass.value("uTime", time);
			weatherPass.value("uWind", wind);
			weatherPass.value("uNight", env.night);
			gl.bindBuffer(gl.ARRAY_BUFFER, screen);
			const index = weatherPass.attribute("aPosition", 2, 0, 0);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.disableVertexAttribArray(index);
			gl.disable(gl.BLEND);
		}
		return camera;
	}

	return {
		draw,
		dispose() {
			gl.deleteProgram(skyPass.program);
			gl.deleteProgram(world.program);
			gl.deleteProgram(weatherPass.program);
			gl.deleteProgram(shadowPass.program);
			gl.deleteFramebuffer(shadowFbo);
			gl.deleteRenderbuffer(shadowDepth);
			gl.deleteTexture(shadowMap);
			gl.deleteBuffer(geometry);
			gl.deleteBuffer(screen);
			gl.deleteFramebuffer(fbo);
			gl.deleteRenderbuffer(depth);
			gl.deleteTexture(reflection);
		},
	};
}
