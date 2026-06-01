extends Control
class_name VehicleBlueprint

# ====================================================
# VehicleBlueprint.gd — Programmatic High-Fidelity 2D CAD Vector Blueprint Node
# Renders animated, premium vector layouts of fleet trucks without raster assets.
# ====================================================

@export var manufacturer: String = "SCARFIA"
@export var cab_type: String = "STANDARD" # STANDARD, EXTENDED, SUPER_LONG
@export var payload_type: String = "DRY"   # DRY, REEFER, CONSTRUCTION, AUTOMOTIVE, HAZARDOUS, LOGGING, ULTRA_HEAVY
@export var tuning_tier: String = "STOCK"   # STOCK, PERFORMANCE, ECONOMY, RELIABLE
@export var is_animated: bool = true
@export var health_pct: int = 100
@export var highlighted_part: String = "" # ENGINE, TIRES, FUEL_TANK, CHASSIS, SHIELDING, TACHO

func _ready() -> void:
	# Set default size if none set
	if custom_minimum_size == Vector2.ZERO:
		custom_minimum_size = Vector2(744, 180)
	size = custom_minimum_size

func _process(_delta: float) -> void:
	if is_animated:
		queue_redraw()

func _draw() -> void:
	_draw_cad_grid()
	_draw_ground_track()
	_draw_dimension_lines()
	
	# Determine base colors based on manufacturer or theme
	var primary_color = Color(0.2, 0.9, 0.7, 0.85) # Cyber Cyan
	if manufacturer.to_upper() == "TESIO":
		primary_color = Color(0.65, 0.45, 1.0, 0.85) # Tesla Violet
	elif manufacturer.to_upper() == "MOOSE":
		primary_color = Color(0.95, 0.55, 0.15, 0.85) # Moose Orange
	elif manufacturer.to_upper() == "GUY":
		primary_color = Color(0.15, 0.65, 0.95, 0.85) # German Sky Blue
	
	# Draw chassis frame
	_draw_chassis(primary_color)
	
	# Draw engine/tuning systems
	_draw_engine_block()
	
	# Draw cabin
	_draw_cabin(primary_color)
	
	# Draw cargo rigging payload
	_draw_cargo_rig(primary_color)
	
	# Draw axles & animated wheels
	_draw_wheels()
	
	# Draw visual status text overlay
	_draw_diagnostics_overlay()
	
	# Draw dynamic highlighted upgrade halos
	_draw_highlight_halo()

func _draw_cad_grid() -> void:
	var grid_color = Color(0.08, 0.14, 0.22, 0.22)
	var step = 20.0
	
	# Draw vertical lines
	for x in range(0, int(size.x), int(step)):
		draw_line(Vector2(x, 0), Vector2(x, size.y), grid_color, 1.0)
	
	# Draw horizontal lines
	for y in range(0, int(size.y), int(step)):
		draw_line(Vector2(0, y), Vector2(size.x, y), grid_color, 1.0)
		
	# Draw outer glowing CAD border
	var border_col = Color(0.2, 0.9, 0.7, 0.15)
	draw_rect(Rect2(Vector2.ZERO, size), border_col, false, 1.5)

func _draw_ground_track() -> void:
	var ground_y = 145.0
	var track_col = Color(0.12, 0.2, 0.28, 0.6)
	
	# Solid line
	draw_line(Vector2(30, ground_y), Vector2(size.x - 30, ground_y), track_col, 2.0)
	
	# Ticks
	for x in range(40, int(size.x - 40), 15):
		draw_line(Vector2(x, ground_y), Vector2(x - 4, ground_y + 4), track_col * 0.7, 1.0)

func _draw_dimension_lines() -> void:
	var font = ThemeDB.get_fallback_font()
	var font_size = 9
	var cad_col = Color(0.2, 0.9, 0.7, 0.4)
	
	# Dynamic values
	var length_txt = "8.2 m"
	var height_txt = "3.8 m"
	
	if cab_type == "EXTENDED": length_txt = "9.4 m"
	elif cab_type == "SUPER_LONG": length_txt = "10.8 m"
	
	if payload_type == "ULTRA_HEAVY": length_txt = "14.2 m"; height_txt = "4.3 m"
	elif payload_type == "HAZARDOUS": height_txt = "4.0 m"
	elif payload_type == "CONSTRUCTION": height_txt = "4.1 m"
	
	# A. Horizontal length line (at y = 160)
	var lx1 = 100.0
	var lx2 = 680.0
	if payload_type == "ULTRA_HEAVY": lx2 = 710.0
	var ly = 160.0
	
	draw_line(Vector2(lx1, ly), Vector2(lx2, ly), cad_col, 1.0)
	draw_line(Vector2(lx1, ly - 4), Vector2(lx1, ly + 4), cad_col, 1.0)
	draw_line(Vector2(lx2, ly - 4), Vector2(lx2, ly + 4), cad_col, 1.0)
	
	# Draw arrowheads
	draw_line(Vector2(lx1, ly), Vector2(lx1 + 6, ly - 3), cad_col, 1.0)
	draw_line(Vector2(lx1, ly), Vector2(lx1 + 6, ly + 3), cad_col, 1.0)
	draw_line(Vector2(lx2, ly), Vector2(lx2 - 6, ly - 3), cad_col, 1.0)
	draw_line(Vector2(lx2, ly), Vector2(lx2 - 6, ly + 3), cad_col, 1.0)
	
	# Length text
	var l_pos = Vector2((lx1 + lx2) * 0.5 - 20, ly - 5)
	draw_string(font, l_pos, "L: " + length_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, cad_col * 1.5)
	
	# B. Vertical height line (at x = 40)
	var hx = 45.0
	var hy1 = 30.0
	if payload_type == "ULTRA_HEAVY" or payload_type == "HAZARDOUS": hy1 = 20.0
	var hy2 = 145.0
	
	draw_line(Vector2(hx, hy1), Vector2(hx, hy2), cad_col, 1.0)
	draw_line(Vector2(hx - 4, hy1), Vector2(hx + 4, hy1), cad_col, 1.0)
	draw_line(Vector2(hx - 4, hy2), Vector2(hx + 4, hy2), cad_col, 1.0)
	
	# Arrowheads
	draw_line(Vector2(hx, hy1), Vector2(hx - 3, hy1 + 6), cad_col, 1.0)
	draw_line(Vector2(hx, hy1), Vector2(hx + 3, hy1 + 6), cad_col, 1.0)
	draw_line(Vector2(hx, hy2), Vector2(hx - 3, hy2 - 6), cad_col, 1.0)
	draw_line(Vector2(hx, hy2), Vector2(hx + 3, hy2 - 6), cad_col, 1.0)
	
	# Height text (draw vertically or offset)
	var h_pos = Vector2(hx + 8, (hy1 + hy2) * 0.5 + 4)
	draw_string(font, h_pos, "H: " + height_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, cad_col * 1.5)

func _draw_chassis(color: Color) -> void:
	var chassis_col = Color(0.18, 0.28, 0.38, 0.8)
	var ground_y = 145.0
	
	# Main chassis rails (thick lines)
	var length = 560.0
	if payload_type == "ULTRA_HEAVY": length = 610.0
	
	var rail_y = ground_y - 18.0
	draw_line(Vector2(100, rail_y), Vector2(100 + length, rail_y), chassis_col, 5.0)
	draw_line(Vector2(120, rail_y + 4), Vector2(100 + length - 20, rail_y + 4), chassis_col * 0.6, 2.0)
	
	# Front crash bumper
	draw_rect(Rect2(Vector2(85, rail_y - 6), Vector2(15, 12)), color * 0.8, true)
	# Bumper detailed lines
	draw_line(Vector2(85, rail_y - 6), Vector2(100, rail_y + 6), Color.BLACK, 1.0)

func _draw_cabin(color: Color) -> void:
	var cab_col = color
	var window_col = Color(0.08, 0.18, 0.24, 0.9)
	var ground_y = 145.0
	var cab_y_bottom = ground_y - 18.0
	
	# Establish layout based on cab sleeper spec
	if cab_type == "SUPER_LONG":
		# Classic American long-nose configuration
		# Hood (low front nose)
		var hood_rect = Rect2(Vector2(100, cab_y_bottom - 44), Vector2(55, 42))
		draw_rect(hood_rect, cab_col * 0.7, false, 2.0)
		draw_rect(hood_rect, Color(0.05, 0.05, 0.08, 0.5), true)
		
		# Chrome grill mesh
		draw_line(Vector2(100, cab_y_bottom), Vector2(100, cab_y_bottom - 44), color, 4.0)
		draw_line(Vector2(104, cab_y_bottom - 2), Vector2(104, cab_y_bottom - 42), Color.GOLD, 1.0)
		
		# Sleeper Cabin (behind hood)
		var cab_rect = Rect2(Vector2(155, cab_y_bottom - 82), Vector2(110, 80))
		draw_rect(cab_rect, cab_col, false, 2.0)
		draw_rect(cab_rect, Color(0.04, 0.04, 0.06, 0.75), true)
		
		# Windshield slant line
		draw_line(Vector2(155, cab_y_bottom - 44), Vector2(168, cab_y_bottom - 82), cab_col, 2.0)
		
		# Cabin windows
		var win_points = PackedVector2Array([
			Vector2(168, cab_y_bottom - 74),
			Vector2(200, cab_y_bottom - 74),
			Vector2(200, cab_y_bottom - 44),
			Vector2(165, cab_y_bottom - 44)
		])
		draw_polygon(win_points, [window_col])
		draw_polyline(win_points, color * 0.8, 1.5)
		
		# Sleeper port-hole window
		draw_circle(Vector2(230, cab_y_bottom - 60), 8.0, window_col)
		draw_arc(Vector2(230, cab_y_bottom - 60), 8.0, 0, TAU, 16, color * 0.7, 1.0, true)
		
		# Dual vertical exhaust smokestacks (super long feature)
		var stack_x1 = 268.0
		var stack_x2 = 272.0
		draw_line(Vector2(stack_x1, cab_y_bottom), Vector2(stack_x1, cab_y_bottom - 98), Color.DARK_GRAY, 3.5)
		draw_line(Vector2(stack_x1, cab_y_bottom - 90), Vector2(stack_x1, cab_y_bottom - 98), color * 1.5, 1.5)
		draw_line(Vector2(stack_x2, cab_y_bottom), Vector2(stack_x2, cab_y_bottom - 98), Color.DARK_GRAY, 3.5)
		draw_line(Vector2(stack_x2, cab_y_bottom - 90), Vector2(stack_x2, cab_y_bottom - 98), color * 1.5, 1.5)
		
	elif cab_type == "EXTENDED":
		# European cabover sleeper
		var cab_rect = Rect2(Vector2(100, cab_y_bottom - 84), Vector2(115, 82))
		draw_rect(cab_rect, cab_col, false, 2.0)
		draw_rect(cab_rect, Color(0.04, 0.04, 0.06, 0.75), true)
		
		# Front aerodynamic slant
		draw_line(Vector2(100, cab_y_bottom - 20), Vector2(104, cab_y_bottom - 84), cab_col, 2.0)
		
		# Side Door Window
		var win_points = PackedVector2Array([
			Vector2(106, cab_y_bottom - 76),
			Vector2(150, cab_y_bottom - 76),
			Vector2(150, cab_y_bottom - 44),
			Vector2(108, cab_y_bottom - 44)
		])
		draw_polygon(win_points, [window_col])
		draw_polyline(win_points, color * 0.8, 1.5)
		
		# Sleeper window (extended cabin)
		var sleep_win = Rect2(Vector2(170, cab_y_bottom - 66), Vector2(28, 16))
		draw_rect(sleep_win, window_col, true)
		draw_rect(sleep_win, color * 0.7, false, 1.0)
		
		# Deflector roof vane
		var def_points = PackedVector2Array([
			Vector2(104, cab_y_bottom - 84),
			Vector2(130, cab_y_bottom - 94),
			Vector2(200, cab_y_bottom - 84)
		])
		draw_polyline(def_points, color * 1.2, 2.0)
		
	else:
		# STANDARD: Tight city cabover profile
		var cab_rect = Rect2(Vector2(100, cab_y_bottom - 80), Vector2(80, 78))
		draw_rect(cab_rect, cab_col, false, 2.0)
		draw_rect(cab_rect, Color(0.04, 0.04, 0.06, 0.75), true)
		
		# Side Window
		var win_points = PackedVector2Array([
			Vector2(106, cab_y_bottom - 72),
			Vector2(150, cab_y_bottom - 72),
			Vector2(150, cab_y_bottom - 44),
			Vector2(108, cab_y_bottom - 44)
		])
		draw_polygon(win_points, [window_col])
		draw_polyline(win_points, color * 0.8, 1.5)

func _draw_engine_block() -> void:
	var ground_y = 145.0
	var eng_y = ground_y - 34.0
	
	# Positioning engine block depending on cabovers or nose hoods
	var eng_x = 125.0
	if cab_type == "SUPER_LONG":
		eng_x = 110.0
		
	var size_rect = Vector2(40, 24)
	var eng_rect = Rect2(Vector2(eng_x, eng_y), size_rect)
	
	# Determine color & glowing properties by tuning spec
	var eng_col = Color(0.5, 0.5, 0.5, 0.5) # stock grey
	var wire_width = 1.0
	
	match tuning_tier.to_upper():
		"PERFORMANCE":
			eng_col = Color(0.9, 0.2, 0.2, 0.8) # neon fire red
			wire_width = 2.0
		"ECONOMY":
			eng_col = Color(0.15, 0.8, 0.4, 0.8) # eco green
			wire_width = 1.5
		"RELIABLE":
			eng_col = Color(0.2, 0.5, 0.9, 0.8) # reliable neon blue
			wire_width = 2.0
			
	# Draw filled engine block backing
	draw_rect(eng_rect, Color(0.04, 0.04, 0.05, 0.9), true)
	draw_rect(eng_rect, eng_col, false, wire_width)
	
	# Draw interior detail (piston chambers wireframe or loops)
	draw_line(Vector2(eng_x + 10, eng_y + 4), Vector2(eng_x + 10, eng_y + 20), eng_col * 0.8, 1.0)
	draw_line(Vector2(eng_x + 20, eng_y + 4), Vector2(eng_x + 20, eng_y + 20), eng_col * 0.8, 1.0)
	draw_line(Vector2(eng_x + 30, eng_y + 4), Vector2(eng_x + 30, eng_y + 20), eng_col * 0.8, 1.0)
	
	# Animated pulses for active performance
	if is_animated and tuning_tier != "STOCK":
		var pulse_idx = (Time.get_ticks_msec() / 250) % 3
		var pulse_x = eng_x + 10 + (pulse_idx * 10)
		draw_circle(Vector2(pulse_x, eng_y + 12), 3.0, eng_col * 1.5)

func _draw_cargo_rig(color: Color) -> void:
	var ground_y = 145.0
	var rig_y_bottom = ground_y - 18.0
	
	# Determine cargo starting x-position (behind cabin sleep compartment)
	var cargo_x = 190.0
	if cab_type == "EXTENDED": cargo_x = 225.0
	elif cab_type == "SUPER_LONG": cargo_x = 275.0
	
	var cargo_w = 660.0 - cargo_x
	if payload_type == "ULTRA_HEAVY":
		cargo_w = 710.0 - cargo_x
		
	var cargo_h = 110.0 # Standard box height
	var cargo_y_top = rig_y_bottom - cargo_h
	
	# Backing panel clear out
	var cargo_rect = Rect2(Vector2(cargo_x, cargo_y_top), Vector2(cargo_w, cargo_h))
	
	match payload_type.to_upper():
		"DRY":
			# Standard cargo dry box container
			draw_rect(cargo_rect, Color(0.04, 0.04, 0.05, 0.8), true)
			draw_rect(cargo_rect, color * 0.8, false, 1.5)
			
			# Corrugated vertical panel lines
			for cx in range(int(cargo_x + 20), int(cargo_x + cargo_w), 24):
				draw_line(Vector2(cx, cargo_y_top), Vector2(cx, rig_y_bottom), color * 0.35, 1.0)
			
			# Door structural details
			draw_line(Vector2(cargo_x + cargo_w - 6, cargo_y_top), Vector2(cargo_x + cargo_w - 6, rig_y_bottom), color, 1.5)
			draw_rect(Rect2(Vector2(cargo_x + cargo_w - 14, cargo_y_top + 40), Vector2(6, 12)), color * 0.8, true)
			
		"REEFER":
			# Refrigerated Box Container
			draw_rect(cargo_rect, Color(0.04, 0.04, 0.05, 0.8), true)
			draw_rect(cargo_rect, color * 0.8, false, 1.5)
			
			# Front reefer cooling compressor unit
			var comp_w = 22.0
			var comp_rect = Rect2(Vector2(cargo_x - comp_w, cargo_y_top + 25), Vector2(comp_w, 45))
			draw_rect(comp_rect, Color(0.05, 0.07, 0.1, 0.95), true)
			draw_rect(comp_rect, color * 1.3, false, 1.5)
			# Cooling fan grille details
			draw_circle(Vector2(cargo_x - comp_w * 0.5, cargo_y_top + 42), 6.0, color * 0.4)
			if is_animated:
				var fan_rot = (Time.get_ticks_msec() * 0.01)
				draw_line(
					Vector2(cargo_x - comp_w * 0.5, cargo_y_top + 42),
					Vector2(cargo_x - comp_w * 0.5 + cos(fan_rot) * 5.0, cargo_y_top + 42 + sin(fan_rot) * 5.0),
					color * 1.5,
					1.5
				)
			
			# Interior cooling wave lines
			if is_animated:
				var wave_offset = float(Time.get_ticks_msec() % 1000) / 1000.0
				var cool_col = Color(0.2, 0.8, 1.0, 0.25)
				for i in range(4):
					var wx = cargo_x + 30.0 + (i * 70.0) + (wave_offset * 40.0)
					if wx < cargo_x + cargo_w - 20:
						draw_line(Vector2(wx, cargo_y_top + 30), Vector2(wx + 10, cargo_y_top + 40), cool_col, 1.5)
						draw_line(Vector2(wx + 10, cargo_y_top + 40), Vector2(wx, cargo_y_top + 50), cool_col, 1.5)
						draw_line(Vector2(wx, cargo_y_top + 50), Vector2(wx + 10, cargo_y_top + 60), cool_col, 1.5)
			
		"CONSTRUCTION":
			# Industrial Tipper dumper bed (angled profile)
			var tip_h = 75.0
			var tip_y_top = rig_y_bottom - tip_h
			
			# Tipper slanted polygon points
			var tip_pts = PackedVector2Array([
				Vector2(cargo_x + 10, tip_y_top),
				Vector2(cargo_x + cargo_w, tip_y_top - 5),
				Vector2(cargo_x + cargo_w - 10, rig_y_bottom),
				Vector2(cargo_x + 25, rig_y_bottom)
			])
			draw_polygon(tip_pts, [Color(0.05, 0.05, 0.08, 0.8)])
			draw_polyline(tip_pts, color, 1.5)
			
			# Reinforcing industrial rib beams
			for rx in range(int(cargo_x + 60), int(cargo_x + cargo_w - 40), 40):
				draw_line(Vector2(rx, tip_y_top - 2), Vector2(rx - 8, rig_y_bottom), color * 0.6, 2.0)
				
			# Hydraulic support cylinders
			var hyd_pts = PackedVector2Array([
				Vector2(cargo_x + 40, rig_y_bottom),
				Vector2(cargo_x + 15, tip_y_top + 25)
			])
			draw_polyline(hyd_pts, Color.GOLD, 2.5)
			
		"AUTOMOTIVE":
			# Skeletal double-deck car carrier frame
			var truss_col = color * 0.75
			var car_col = Color(1.0, 0.8, 0.2, 0.25)
			
			# Bottom deck and top deck structure rails
			draw_line(Vector2(cargo_x, rig_y_bottom), Vector2(cargo_x + cargo_w, rig_y_bottom), truss_col, 3.0)
			draw_line(Vector2(cargo_x + 10, rig_y_bottom - 50), Vector2(cargo_x + cargo_w, rig_y_bottom - 50), truss_col, 2.0)
			
			# Upright support structural trusses
			for support_x in range(int(cargo_x + 20), int(cargo_x + cargo_w), 55):
				draw_line(Vector2(support_x, rig_y_bottom), Vector2(support_x + 10, rig_y_bottom - 50), truss_col, 1.5)
				draw_line(Vector2(support_x + 10, rig_y_bottom), Vector2(support_x, rig_y_bottom - 50), truss_col, 1.5)
				
			# Wireframe sport-car profiles loaded on decks
			_draw_wireframe_car_silhouette(Vector2(cargo_x + 40, rig_y_bottom - 4), car_col)
			_draw_wireframe_car_silhouette(Vector2(cargo_x + 160, rig_y_bottom - 4), car_col)
			_draw_wireframe_car_silhouette(Vector2(cargo_x + 100, rig_y_bottom - 54), car_col)
			
		"HAZARDOUS":
			# Cylindrical chemical fluid pressurized tanker tank
			var tank_h = 76.0
			var tank_y = rig_y_bottom - tank_h - 4
			
			# Main cylinder body with rounded ends
			var tank_pts = PackedVector2Array()
			var steps = 16
			
			# Left cap half-circle
			var left_center = Vector2(cargo_x + 35, tank_y + tank_h * 0.5)
			var r = tank_h * 0.5
			for i in range(steps + 1):
				var a = PI * 0.5 + (float(i) / steps) * PI
				tank_pts.append(left_center + Vector2(cos(a) * 20.0, sin(a) * r))
				
			# Right cap half-circle
			var right_center = Vector2(cargo_x + cargo_w - 35, tank_y + tank_h * 0.5)
			for i in range(steps + 1):
				var a = -PI * 0.5 + (float(i) / steps) * PI
				tank_pts.append(right_center + Vector2(cos(a) * 20.0, sin(a) * r))
				
			draw_polygon(tank_pts, [Color(0.04, 0.04, 0.05, 0.85)])
			draw_polyline(tank_pts, Color(0.95, 0.55, 0.15, 0.85), 1.5) # Warning orange tank
			
			# Steel tank retaining bands
			for band_x in range(int(cargo_x + 60), int(cargo_x + cargo_w - 60), 50):
				draw_line(Vector2(band_x, tank_y), Vector2(band_x, tank_y + tank_h), Color(0.95, 0.55, 0.15, 0.4), 2.0)
				
			# Danger hazardous placard icon (diamond shape)
			var icon_center = Vector2(cargo_x + cargo_w * 0.5, tank_y + tank_h * 0.5)
			var icon_pts = PackedVector2Array([
				icon_center + Vector2(0, -12),
				icon_center + Vector2(12, 0),
				icon_center + Vector2(0, 12),
				icon_center + Vector2(-12, 0)
			])
			draw_polygon(icon_pts, [Color.RED])
			draw_polyline(icon_pts, Color.WHITE, 1.0)
			
			# Dynamic liquid sloshing indicators
			if is_animated:
				var slosh_time = Time.get_ticks_msec() * 0.003
				var slosh_y = tank_y + tank_h * 0.5 + sin(slosh_time) * 3.0
				var slosh_pts = PackedVector2Array([
					Vector2(cargo_x + 50, slosh_y),
					Vector2(cargo_x + cargo_w - 50, slosh_y + cos(slosh_time) * 2.0),
					Vector2(cargo_x + cargo_w - 50, tank_y + tank_h - 4),
					Vector2(cargo_x + 50, tank_y + tank_h - 4)
				])
				draw_polygon(slosh_pts, [Color(0.95, 0.55, 0.15, 0.12)])
			
		"LOGGING":
			# Logging frame stakes and stacked logs
			var stake_col = color * 0.7
			var log_col = Color(0.72, 0.48, 0.34, 0.75) # timber wood brown
			
			# Heavy vertical posts (stakes)
			var posts_x = [cargo_x + 15, cargo_x + cargo_w * 0.35, cargo_x + cargo_w * 0.7, cargo_x + cargo_w - 15]
			for px in posts_x:
				draw_line(Vector2(px, rig_y_bottom), Vector2(px, rig_y_bottom - 75), stake_col, 3.5)
				draw_line(Vector2(px - 4, rig_y_bottom), Vector2(px + 4, rig_y_bottom), stake_col, 2.0)
				
			# Renders stacked wooden logs cylinders (front round logs profiles)
			var ly1 = rig_y_bottom - 12
			var ly2 = rig_y_bottom - 34
			var ly3 = rig_y_bottom - 56
			
			_draw_wood_log(Vector2(cargo_x + 40, ly1), 11, log_col)
			_draw_wood_log(Vector2(cargo_x + 120, ly1), 11, log_col)
			_draw_wood_log(Vector2(cargo_x + 200, ly1), 11, log_col)
			_draw_wood_log(Vector2(cargo_x + 280, ly1), 11, log_col)
			
			_draw_wood_log(Vector2(cargo_x + 80, ly2), 11, log_col)
			_draw_wood_log(Vector2(cargo_x + 160, ly2), 11, log_col)
			_draw_wood_log(Vector2(cargo_x + 240, ly2), 11, log_col)
			
			_draw_wood_log(Vector2(cargo_x + 120, ly3), 11, log_col)
			_draw_wood_log(Vector2(cargo_x + 200, ly3), 11, log_col)
			
		"ULTRA_HEAVY":
			# Mult-axle massive lowboy transporter
			var lowboy_col = color * 0.8
			var lowboy_h = 32.0
			var lowboy_y = rig_y_bottom - lowboy_h
			
			# Dropdeck platform outline
			var platform_pts = PackedVector2Array([
				Vector2(cargo_x, rig_y_bottom),
				Vector2(cargo_x + 35, lowboy_y),
				Vector2(cargo_x + cargo_w - 75, lowboy_y),
				Vector2(cargo_x + cargo_w - 45, rig_y_bottom),
				Vector2(cargo_x + cargo_w, rig_y_bottom),
				Vector2(cargo_x + cargo_w, rig_y_bottom + 6),
				Vector2(cargo_x, rig_y_bottom + 6)
			])
			draw_polygon(platform_pts, [Color(0.04, 0.04, 0.05, 0.95)])
			draw_polyline(platform_pts, lowboy_col, 2.0)
			
			# Renders huge massive high-voltage reactor core payload
			var payload_w = cargo_w - 140
			var payload_h = 75.0
			var payload_rect = Rect2(Vector2(cargo_x + 50, lowboy_y - payload_h), Vector2(payload_w, payload_h))
			
			draw_rect(payload_rect, Color(0.04, 0.06, 0.09, 0.98), true)
			draw_rect(payload_rect, Color(0.6, 0.15, 0.95, 0.9), false, 2.0) # Violet reactor outline
			
			# Cooling vents details
			for cx in range(int(cargo_x + 75), int(cargo_x + 75 + payload_w - 40), 18):
				draw_rect(Rect2(Vector2(cx, lowboy_y - payload_h + 10), Vector2(10, 55)), Color(0.6, 0.15, 0.95, 0.35), true)
				
			# Glowing hazard indicators
			if is_animated:
				var electric_pulse = (Time.get_ticks_msec() / 150) % 2 == 0
				var lamp_color = Color.MAGENTA if electric_pulse else Color(0.3, 0.0, 0.3)
				draw_circle(Vector2(cargo_x + 50 + payload_w * 0.5, lowboy_y - payload_h + 15), 4.0, lamp_color)
				
				# Structural tiedown cables
				draw_line(Vector2(cargo_x + 25, lowboy_y), Vector2(cargo_x + 70, lowboy_y - payload_h + 10), color * 0.4, 1.5)
				draw_line(Vector2(cargo_x + cargo_w - 75, lowboy_y), Vector2(cargo_x + 50 + payload_w - 20, lowboy_y - payload_h + 10), color * 0.4, 1.5)

func _draw_wireframe_car_silhouette(pos: Vector2, car_color: Color) -> void:
	var car_pts = PackedVector2Array([
		pos,
		pos + Vector2(5, -4),
		pos + Vector2(15, -4),
		pos + Vector2(25, -16),
		pos + Vector2(50, -16),
		pos + Vector2(65, -4),
		pos + Vector2(80, -4),
		pos + Vector2(85, 0),
		pos
	])
	draw_polyline(car_pts, car_color, 1.0)
	draw_circle(pos + Vector2(16, 0), 4.0, car_color * 0.5)
	draw_circle(pos + Vector2(60, 0), 4.0, car_color * 0.5)

func _draw_wood_log(center: Vector2, r: float, color: Color) -> void:
	draw_circle(center, r, Color(0.04, 0.04, 0.05, 0.95))
	draw_circle(center, r, color * 0.4)
	draw_arc(center, r, 0, TAU, 16, color, 1.5, true)
	
	# Spiral growth ring lines
	draw_arc(center, r * 0.65, 0.2, PI * 1.6, 12, color * 0.6, 1.0, true)
	draw_arc(center, r * 0.3, 0.5, PI * 1.8, 8, color * 0.6, 1.0, true)

func _draw_wheels() -> void:
	var ground_y = 145.0
	var wheel_r = 13.0
	var wheel_col = Color(0.12, 0.18, 0.24, 0.9)
	var hub_col = Color(0.2, 0.9, 0.7, 0.85)
	
	# Axle positions mapping (dynamic axles)
	var front_axles = [140.0]
	var rear_axles = [460.0, 510.0]
	
	# Ultra heavy drops rear axles and adds extra front axle
	if payload_type == "ULTRA_HEAVY":
		front_axles = [140.0, 180.0]
		rear_axles = [440.0, 480.0, 520.0, 560.0]
	elif payload_type == "HAZARDOUS" or payload_type == "CONSTRUCTION":
		rear_axles = [440.0, 490.0, 540.0]
	
	var all_axles = front_axles + rear_axles
	
	# Wheel rotation calculation
	var wheel_angle = 0.0
	if is_animated:
		wheel_angle = fmod(float(Time.get_ticks_msec()) * 0.006, TAU)
		
	for ax in all_axles:
		var center = Vector2(ax, ground_y - wheel_r)
		
		# Draw outer tire (filled dark-slate)
		draw_circle(center, wheel_r, Color(0.03, 0.03, 0.04, 1.0))
		draw_circle(center, wheel_r, wheel_col * 0.4)
		draw_arc(center, wheel_r, 0, TAU, 18, wheel_col, 2.0, true)
		
		# Rim inner ring
		draw_circle(center, wheel_r - 4, Color(0.06, 0.08, 0.12, 0.9))
		draw_arc(center, wheel_r - 4, 0, TAU, 12, hub_col * 0.5, 1.0, true)
		
		# Rotating spoke lines (feel dynamic!)
		for s in range(5):
			var a = wheel_angle + (float(s) / 5.0) * TAU
			var outer_pt = center + Vector2(cos(a), sin(a)) * (wheel_r - 2)
			var inner_pt = center + Vector2(cos(a), sin(a)) * 2.0
			draw_line(inner_pt, outer_pt, hub_col, 1.0)
			
		# Hub cover center cap
		draw_circle(center, 2.0, Color.WHITE)

func _draw_diagnostics_overlay() -> void:
	var font = ThemeDB.get_fallback_font()
	var font_size = 9
	var overlay_col = Color(0.2, 0.9, 0.7, 0.65)
	
	var health_col = Color(0.2, 0.85, 0.45) # Healthy green
	if health_pct < 25: health_col = Color.RED
	elif health_pct < 60: health_col = Color.GOLD
	
	# Top right diag dashboard block
	var dx = size.x - 200.0
	var dy = 16.0
	
	# Glass dashboard plate
	var dash_rect = Rect2(Vector2(dx - 10, dy - 6), Vector2(190, 72))
	draw_rect(dash_rect, Color(0.05, 0.06, 0.08, 0.85), true)
	draw_rect(dash_rect, overlay_col * 0.4, false, 1.0)
	
	# Micro diagnostic console readings
	draw_string(font, Vector2(dx, dy + 10), "LOGISTIXPERT FLEET DIAGNOSTICS", HORIZONTAL_ALIGNMENT_LEFT, -1, font_size - 1, overlay_col)
	draw_string(font, Vector2(dx, dy + 22), "=============================", HORIZONTAL_ALIGNMENT_LEFT, -1, font_size - 1, overlay_col * 0.5)
	
	draw_string(font, Vector2(dx, dy + 34), "SYS_INTEGRITY: ", HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, overlay_col)
	draw_string(font, Vector2(dx + 90, dy + 34), "%d %%" % health_pct, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, health_col)
	
	draw_string(font, Vector2(dx, dy + 45), "ECU_CHIP_MOD: ", HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, overlay_col)
	var mod_txt = tuning_tier
	if tuning_tier == "STOCK": mod_txt = "STOCK_FACTORY"
	draw_string(font, Vector2(dx + 90, dy + 45), mod_txt.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, Color.GOLD if tuning_tier != "STOCK" else overlay_col * 0.75)
	
	draw_string(font, Vector2(dx, dy + 56), "COMM_LINK: ", HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, overlay_col)
	draw_string(font, Vector2(dx + 90, dy + 56), "SECURE_SOCKET_ONLINE", HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, Color(0.2, 0.85, 0.45, 0.85))
	
	# Glowing pulse beacon
	var pulse_col = Color.GREEN if is_animated and (Time.get_ticks_msec() / 400) % 2 == 0 else Color(0.0, 0.3, 0.0)
	draw_circle(Vector2(dx + 165, dy + 53), 3.0, pulse_col)

func _draw_highlight_halo() -> void:
	if highlighted_part == "":
		return
		
	var pulse = (sin(float(Time.get_ticks_msec()) * 0.008) + 1.0) * 0.5 # 0.0 to 1.0
	var halo_color = Color(1.0, 0.84, 0.0, 0.15 + pulse * 0.25) # Glowing gold halo
	var line_color = Color(1.0, 0.84, 0.0, 0.5 + pulse * 0.5)
	
	var centers = []
	var radii = []
	
	match highlighted_part.to_upper():
		"ENGINE":
			var eng_x = 125.0
			if cab_type == "SUPER_LONG":
				eng_x = 110.0
			centers.append(Vector2(eng_x + 20, 145.0 - 24.0))
			radii.append(28.0)
		"TIRES":
			var front_axles = [140.0]
			var rear_axles = [460.0, 510.0]
			if payload_type == "ULTRA_HEAVY":
				front_axles = [140.0, 180.0]
				rear_axles = [440.0, 480.0, 520.0, 560.0]
			elif payload_type == "HAZARDOUS" or payload_type == "CONSTRUCTION":
				rear_axles = [440.0, 490.0, 540.0]
			
			for ax in (front_axles + rear_axles):
				centers.append(Vector2(ax, 145.0 - 13.0))
				radii.append(20.0)
		"FUEL_TANK":
			var tx = 180.0
			if cab_type == "EXTENDED": tx = 210.0
			elif cab_type == "SUPER_LONG": tx = 250.0
			centers.append(Vector2(tx, 145.0 - 18.0))
			radii.append(25.0)
		"CHASSIS":
			centers.append(Vector2(200.0, 145.0 - 18.0))
			radii.append(30.0)
			centers.append(Vector2(380.0, 145.0 - 18.0))
			radii.append(30.0)
		"SHIELDING":
			var sx = 140.0
			if cab_type == "EXTENDED": sx = 160.0
			elif cab_type == "SUPER_LONG": sx = 200.0
			centers.append(Vector2(sx, 145.0 - 55.0))
			radii.append(38.0)
		"TACHO":
			var wx = 125.0
			if cab_type == "EXTENDED": wx = 128.0
			elif cab_type == "SUPER_LONG": wx = 182.0
			centers.append(Vector2(wx, 145.0 - 58.0))
			radii.append(20.0)
			
	for i in range(centers.size()):
		var c = centers[i]
		var base_r = radii[i]
		var r = base_r + pulse * 6.0
		
		# Draw pulsing translucent fill
		draw_circle(c, r, halo_color)
		# Draw glowing border circle
		draw_arc(c, r, 0, TAU, 32, line_color, 2.0, true)
		# Draw a smaller accent circle
		draw_arc(c, base_r - 2.0, 0, TAU, 24, line_color * 0.5, 1.0, true)
