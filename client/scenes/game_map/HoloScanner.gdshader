shader_type canvas_item;

// AAA Holo-Scanner CRT Shader
// Gives the 2D vector map a dark, retro-futuristic control panel glow.

uniform sampler2D screen_texture : hint_screen_texture, filter_linear_mipmap;
uniform float scanline_count : hint_range(0, 1080) = 450.0;
uniform float scanline_alpha : hint_range(0.0, 1.0) = 0.15;
uniform float vignette_intensity : hint_range(0.0, 2.0) = 1.2;
uniform float chromatic_aberration : hint_range(0.0, 0.05) = 0.003;
uniform float curvature : hint_range(0.0, 10.0) = 3.5;

vec2 curve(vec2 uv) {
	uv = (uv - 0.5) * 2.0;
	uv *= 1.1;	
	uv.x *= 1.0 + pow((abs(uv.y) / curvature), 2.0);
	uv.y *= 1.0 + pow((abs(uv.x) / curvature), 2.0);
	uv  = (uv / 2.0) + 0.5;
	return uv;
}

void fragment() {
	vec2 uv = curve(SCREEN_UV);
	
	// Chromatic Aberration
	float r = texture(screen_texture, uv + vec2(chromatic_aberration, 0.0)).r;
	float g = texture(screen_texture, uv).g;
	float b = texture(screen_texture, uv - vec2(chromatic_aberration, 0.0)).b;
	
	vec3 color = vec3(r, g, b);
	
	// Scanlines
	float s = sin(uv.y * scanline_count * 3.14159);
	color -= s * scanline_alpha;
	
	// Vignette
	float v = distance(uv, vec2(0.5, 0.5));
	color *= smoothstep(0.8, 0.2, v * vignette_intensity);
	
	// Screen borders hard cutoff
	if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
		color = vec3(0.0);
	}
	
	COLOR = vec4(color, 1.0);
}
