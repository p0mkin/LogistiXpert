extends Control
class_name CyberGridBackground

# ====================================================
# CyberGridBackground.gd — Reusable Futuristic HUD UI Background Node
# Renders animated, premium vector layouts with zero texture overhead.
# ====================================================

@export var primary_color: Color = Color(0.2, 0.9, 0.7, 0.1)      # Cyber Cyan (Faded)
@export var accent_color: Color = Color(0.65, 0.45, 1.0, 0.08)   # Underworld Purple (Faded)
@export var base_color: Color = Color(0.04, 0.04, 0.06, 1.0)       # Dark Charcoal Backing

@export var enable_grid: bool = true
@export var enable_scanlines: bool = true
@export var enable_sonar: bool = true
@export var enable_hud_ticks: bool = true

var scanline_y: float = 0.0
var sonar_radius: float = 0.0
var radar_angle: float = 0.0

func _ready() -> void:
	# Stretch to full viewport rect by default
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# Ensure mouse clicks pass through
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	
	# Initial placement
	scanline_y = 0.0
	sonar_radius = 0.0

func _process(delta: float) -> void:
	# Update animated scanlines
	if enable_scanlines:
		scanline_y += delta * 42.0
		if scanline_y > size.y + 20.0:
			scanline_y = -20.0
			
	# Update expanding sonar pulses
	if enable_sonar:
		sonar_radius += delta * 65.0
		if sonar_radius > 500.0:
			sonar_radius = 0.0
			
		radar_angle = fmod(radar_angle + delta * 0.4, TAU)
		
	# Redraw vector layers
	queue_redraw()

func _draw() -> void:
	var screen_sz = size
	if screen_sz == Vector2.ZERO:
		return
		
	# 1. Background Solid Fill
	draw_rect(Rect2(Vector2.ZERO, screen_sz), base_color, true)
	
	# 2. Concentric Ambient Glow Highlights (Concentric fading circles for GLES3 safety)
	_draw_radial_glow(Vector2(40.0, 40.0), 380.0, Color(0.2, 0.9, 0.7, 0.06))
	_draw_radial_glow(Vector2(screen_sz.x - 80.0, screen_sz.y - 80.0), 450.0, Color(0.65, 0.45, 1.0, 0.07))
	
	# 3. High-Density CAD Grid with Glowing Junctions
	if enable_grid:
		var grid_col = Color(0.08, 0.12, 0.18, 0.15)
		var step = 40.0
		
		# Draw horizontal and vertical lines
		for x in range(0, int(screen_sz.x), int(step)):
			draw_line(Vector2(x, 0), Vector2(x, screen_sz.y), grid_col, 1.0)
		for y in range(0, int(screen_sz.y), int(step)):
			draw_line(Vector2(0, y), Vector2(screen_sz.x, y), grid_col, 1.0)
			
		# Draw glowing micro junction dots at sparse grid crosses
		var junc_col = Color(0.2, 0.9, 0.7, 0.12)
		for x in range(int(step), int(screen_sz.x), int(step * 3.0)):
			for y in range(int(step), int(screen_sz.y), int(step * 3.0)):
				draw_circle(Vector2(x, y), 1.5, junc_col)
				
	# 4. Expanding Sonar Signal & Sonar Center
	if enable_sonar:
		var sonar_center = Vector2(screen_sz.x - 140.0, 110.0)
		
		# Draw Sonar Origin HUD Sights
		draw_circle(sonar_center, 3.0, Color(0.65, 0.45, 1.0, 0.3))
		draw_arc(sonar_center, 12.0, 0.0, TAU, 16, Color(0.65, 0.45, 1.0, 0.15), 1.0, true)
		draw_arc(sonar_center, 32.0, 0.0, TAU, 24, Color(0.65, 0.45, 1.0, 0.08), 1.0, true)
		
		# Slow sweeping radar line
		var sweep_pt = sonar_center + Vector2(cos(radar_angle), sin(radar_angle)) * 140.0
		draw_line(sonar_center, sweep_pt, Color(0.65, 0.45, 1.0, 0.14), 1.2)
		
		# Expanding Sonar Ring
		var sonar_max_r = 500.0
		var sonar_fade = 1.0 - (sonar_radius / sonar_max_r)
		var pulse_col = Color(0.65, 0.45, 1.0, 0.12 * sonar_fade)
		draw_arc(sonar_center, sonar_radius, 0.0, TAU, 48, pulse_col, 1.5, true)
		
		# Secondary expanding ring
		var sonar_r_2 = fmod(sonar_radius + 250.0, sonar_max_r)
		var sonar_fade_2 = 1.0 - (sonar_r_2 / sonar_max_r)
		var pulse_col_2 = Color(0.65, 0.45, 1.0, 0.06 * sonar_fade_2)
		draw_arc(sonar_center, sonar_r_2, 0.0, TAU, 48, pulse_col_2, 1.0, true)
		
	# 5. Slow-Sweep Fading Horizontal Scanline
	if enable_scanlines:
		var scan_col = Color(0.2, 0.9, 0.7, 0.04)
		draw_line(Vector2(0, scanline_y), Vector2(screen_sz.x, scanline_y), scan_col, 2.0)
		draw_line(Vector2(0, scanline_y - 8.0), Vector2(screen_sz.x, scanline_y - 8.0), scan_col * 0.4, 1.0)
		draw_line(Vector2(0, scanline_y + 8.0), Vector2(screen_sz.x, scanline_y + 8.0), scan_col * 0.4, 1.0)
		
	# 6. Tech HUD calibration ticks on borders
	if enable_hud_ticks:
		var tick_col = Color(0.2, 0.9, 0.7, 0.18)
		
		# Vertical left edge ticks
		for ty in range(60, int(screen_sz.y - 60), 20):
			var tick_len = 5.0
			if ty % 100 == 0:
				tick_len = 10.0
				# Draw mini coordinate coordinate markers
				var font = ThemeDB.get_fallback_font()
				draw_string(font, Vector2(16, ty + 3), "X:00.0%d" % (ty / 100), HORIZONTAL_ALIGNMENT_LEFT, -1, 6, tick_col * 0.7)
			draw_line(Vector2(6, ty), Vector2(6 + tick_len, ty), tick_col, 1.0)
			
		# Horizontal bottom edge ticks
		for tx in range(60, int(screen_sz.x - 60), 30):
			var tick_len = 4.0
			if tx % 150 == 0:
				tick_len = 8.0
			draw_line(Vector2(tx, screen_sz.y - 6), Vector2(tx, screen_sz.y - 6 - tick_len), tick_col, 1.0)
			
	# 7. Sci-Fi Outer Viewport Corner brackets
	_draw_corner_brackets(screen_sz)

func _draw_radial_glow(center: Vector2, max_radius: float, color: Color) -> void:
	var rings = 6
	for i in range(rings):
		var pct = float(i) / float(rings)
		var rad = max_radius * (1.0 - pct)
		var alpha = color.a * pct
		var step_col = Color(color.r, color.g, color.b, alpha)
		draw_circle(center, rad, step_col)

func _draw_corner_brackets(screen_sz: Vector2) -> void:
	var margin = 10.0
	var len_val = 16.0
	var col = Color(0.2, 0.9, 0.7, 0.45) # Neon Cyan bracket glow
	
	# Top-Left Bracket
	draw_line(Vector2(margin, margin), Vector2(margin + len_val, margin), col, 2.0)
	draw_line(Vector2(margin, margin), Vector2(margin, margin + len_val), col, 2.0)
	
	# Top-Right Bracket
	draw_line(Vector2(screen_sz.x - margin, margin), Vector2(screen_sz.x - margin - len_val, margin), col, 2.0)
	draw_line(Vector2(screen_sz.x - margin, margin), Vector2(screen_sz.x - margin, margin + len_val), col, 2.0)
	
	# Bottom-Left Bracket
	draw_line(Vector2(margin, screen_sz.y - margin), Vector2(margin + len_val, screen_sz.y - margin), col, 2.0)
	draw_line(Vector2(margin, screen_sz.y - margin), Vector2(margin, screen_sz.y - margin - len_val), col, 2.0)
	
	# Bottom-Right Bracket
	draw_line(Vector2(screen_sz.x - margin, screen_sz.y - margin), Vector2(screen_sz.x - margin - len_val, screen_sz.y - margin), col, 2.0)
	draw_line(Vector2(screen_sz.x - margin, screen_sz.y - margin), Vector2(screen_sz.x - margin, screen_sz.y - margin - len_val), col, 2.0)
