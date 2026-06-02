extends Control

@onready var user_edit: LineEdit = %UserEdit
@onready var pass_edit: LineEdit = %PassEdit
@onready var login_btn: Button = %LoginBtn
@onready var register_btn: Button = %RegisterBtn
@onready var status_label: Label = %StatusLabel

var remember_check: CheckBox

func _ready() -> void:
	# Build sleek custom styling entirely in code to avoid heavy binary assets
	_apply_visual_theme()
	_setup_graphics_toggle_ui()
	_setup_remember_me_ui()
	_setup_known_profiles_ui()
	_setup_developer_bypass_ui()
	
	# Connect local button signals
	login_btn.pressed.connect(_on_login_pressed)
	register_btn.pressed.connect(_on_register_pressed)
	
	# Listen to network authorization statuses
	NetworkManager.auth_completed.connect(_on_auth_completed)

func _apply_visual_theme() -> void:
	# 1. Styled amber accent flat buttons
	var style_login_normal = StyleBoxFlat.new()
	style_login_normal.bg_color = Color(0.925, 0.607, 0.141, 1.0) # Amber
	style_login_normal.set_corner_radius_all(4)
	style_login_normal.content_margin_left = 12
	style_login_normal.content_margin_right = 12
	
	var style_login_hover = StyleBoxFlat.new()
	style_login_hover.bg_color = Color(0.976, 0.702, 0.282, 1.0) # Lighter Amber
	style_login_hover.set_corner_radius_all(4)
	
	login_btn.add_theme_stylebox_override("normal", style_login_normal)
	login_btn.add_theme_stylebox_override("hover", style_login_hover)
	login_btn.add_theme_stylebox_override("pressed", style_login_normal)
	
	# 2. Register button outline styling
	var style_reg_normal = StyleBoxFlat.new()
	style_reg_normal.bg_color = Color(0, 0, 0, 0)
	style_reg_normal.border_color = Color(0.709, 0.768, 0.843, 0.3)
	style_reg_normal.border_width_bottom = 2
	style_reg_normal.border_width_top = 2
	style_reg_normal.border_width_left = 2
	style_reg_normal.border_width_right = 2
	style_reg_normal.set_corner_radius_all(4)
	
	var style_reg_hover = StyleBoxFlat.new()
	style_reg_hover.bg_color = Color(1, 1, 1, 0.05)
	style_reg_hover.border_color = Color(0.709, 0.768, 0.843, 0.6)
	style_reg_hover.border_width_bottom = 2
	style_reg_hover.border_width_top = 2
	style_reg_hover.border_width_left = 2
	style_reg_hover.border_width_right = 2
	style_reg_hover.set_corner_radius_all(4)
	
	register_btn.add_theme_stylebox_override("normal", style_reg_normal)
	register_btn.add_theme_stylebox_override("hover", style_reg_hover)
	register_btn.add_theme_stylebox_override("pressed", style_reg_normal)
	
	# 3. Input Text Edit field styling
	var style_edit = StyleBoxFlat.new()
	style_edit.bg_color = Color(0.047, 0.051, 0.059, 1.0) # Charcoal
	style_edit.border_color = Color(0.925, 0.607, 0.141, 0.2)
	style_edit.border_width_bottom = 1
	style_edit.content_margin_left = 12
	style_edit.content_margin_top = 8
	
	var style_edit_focus = StyleBoxFlat.new()
	style_edit_focus.bg_color = Color(0.047, 0.051, 0.059, 1.0)
	style_edit_focus.border_color = Color(0.925, 0.607, 0.141, 0.8) # Glowing amber border on focus
	style_edit_focus.border_width_bottom = 2
	style_edit_focus.content_margin_left = 12
	style_edit_focus.content_margin_top = 8
	
	user_edit.add_theme_stylebox_override("normal", style_edit)
	user_edit.add_theme_stylebox_override("focus", style_edit_focus)
	pass_edit.add_theme_stylebox_override("normal", style_edit)
	pass_edit.add_theme_stylebox_override("focus", style_edit_focus)

func _on_login_pressed() -> void:
	var username = user_edit.text.strip_edges()
	var password = pass_edit.text
	
	if username.is_empty() or password.is_empty():
		_set_status("Error: Credentials fields cannot be blank.", Color(0.901, 0.298, 0.235))
		return
		
	_set_status("Authorizing registry access. Connecting...", Color(0.925, 0.607, 0.141))
	_toggle_inputs(false)
	NetworkManager.request_login(username, password)

func _on_register_pressed() -> void:
	var username = user_edit.text.strip_edges()
	var password = pass_edit.text
	
	if username.length() < 3 or password.length() < 6:
		_set_status("Requirement: Username ≥ 3 characters. Password ≥ 6 characters.", Color(0.901, 0.298, 0.235))
		return
		
	_set_status("Submitting security profile registration...", Color(0.925, 0.607, 0.141))
	_toggle_inputs(false)
	NetworkManager.request_register(username, password)

func _on_auth_completed(success: bool, message: String) -> void:
	_toggle_inputs(true)
	
	if success:
		if message == "Login Successful!":
			_save_credentials()
			_save_to_known_profiles(user_edit.text.strip_edges(), pass_edit.text)
			_set_status("Access Granted. Routing database state...", Color(0.180, 0.803, 0.443))
			# Wait a split second to see the success message before loading map
			await get_tree().create_timer(0.6).timeout
			SceneTransition.change_scene_to_file("res://scenes/game_map/GameMap.tscn")
		else:
			_set_status(message, Color(0.180, 0.803, 0.443))
	else:
		_set_status(message, Color(0.901, 0.298, 0.235))

func _set_status(text: String, color: Color) -> void:
	status_label.text = text
	status_label.add_theme_color_override("font_color", color)

func _toggle_inputs(enabled: bool) -> void:
	user_edit.editable = enabled
	pass_edit.editable = enabled
	login_btn.disabled = not enabled
	register_btn.disabled = not enabled
	if remember_check:
		remember_check.disabled = not enabled

# --- Graphics Settings UI Setup ---
var graphics_btn: Button = null

func _setup_graphics_toggle_ui() -> void:
	graphics_btn = Button.new()
	graphics_btn.text = "GRAPHICS: STANDARD"
	if GameState.graphics_quality == "ULTRA_HD":
		graphics_btn.text = "GRAPHICS: ULTRA_HD (NEON)"
		
	# Float top right
	graphics_btn.position = Vector2(size.x - 220, 20)
	graphics_btn.size = Vector2(200, 36)
	add_child(graphics_btn)
	
	# Connect button signal
	graphics_btn.pressed.connect(_on_graphics_toggle_pressed)
	_apply_graphics_btn_style()

func _on_graphics_toggle_pressed() -> void:
	if GameState.graphics_quality == "STANDARD":
		GameState.set_graphics_quality("ULTRA_HD")
		graphics_btn.text = "GRAPHICS: ULTRA_HD (NEON)"
		# Arpeggio success preset blip!
		if has_node("/root/UIEffects"):
			get_node("/root/UIEffects").play_success()
	else:
		GameState.set_graphics_quality("STANDARD")
		graphics_btn.text = "GRAPHICS: STANDARD"
		# Standard selection blip!
		if has_node("/root/UIEffects"):
			get_node("/root/UIEffects").play_click()
			
	_apply_graphics_btn_style()

func _apply_graphics_btn_style() -> void:
	var style_normal = StyleBoxFlat.new()
	var style_hover = StyleBoxFlat.new()
	
	if GameState.graphics_quality == "ULTRA_HD":
		style_normal.bg_color = Color(0.2, 0.9, 0.7, 0.15) # Cyber Cyan translucent
		style_normal.border_color = Color(0.2, 0.9, 0.7, 0.8) # Cyber Cyan border
		style_normal.border_width_left = 1
		style_normal.border_width_top = 1
		style_normal.border_width_right = 1
		style_normal.border_width_bottom = 1
		style_normal.set_corner_radius_all(18)
		
		style_hover.bg_color = Color(0.2, 0.9, 0.7, 0.3)
		style_hover.border_color = Color(0.2, 0.9, 0.7, 1.0)
		style_hover.border_width_left = 1
		style_hover.border_width_top = 1
		style_hover.border_width_right = 1
		style_hover.border_width_bottom = 1
		style_hover.set_corner_radius_all(18)
		
		graphics_btn.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7))
		graphics_btn.add_theme_color_override("font_hover_color", Color.WHITE)
	else:
		style_normal.bg_color = Color(0.08, 0.1, 0.12, 0.6) # Dark slate
		style_normal.border_color = Color(0.709, 0.768, 0.843, 0.25)
		style_normal.border_width_left = 1
		style_normal.border_width_top = 1
		style_normal.border_width_right = 1
		style_normal.border_width_bottom = 1
		style_normal.set_corner_radius_all(18)
		
		style_hover.bg_color = Color(0.12, 0.15, 0.18, 0.8)
		style_hover.border_color = Color(0.709, 0.768, 0.843, 0.5)
		style_hover.border_width_left = 1
		style_hover.border_width_top = 1
		style_hover.border_width_right = 1
		style_hover.border_width_bottom = 1
		style_hover.set_corner_radius_all(18)
		
		graphics_btn.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.8))
		graphics_btn.add_theme_color_override("font_hover_color", Color.WHITE)
		
	graphics_btn.add_theme_stylebox_override("normal", style_normal)
	graphics_btn.add_theme_stylebox_override("hover", style_hover)
	graphics_btn.add_theme_stylebox_override("pressed", style_normal)

func _setup_remember_me_ui() -> void:
	remember_check = CheckBox.new()
	remember_check.text = "Remember Credentials"
	remember_check.add_theme_font_size_override("font_size", 12)
	remember_check.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.8))
	remember_check.add_theme_color_override("font_hover_color", Color.WHITE)
	remember_check.add_theme_color_override("font_pressed_color", Color(0.925, 0.607, 0.141))
	
	var form = user_edit.get_parent().get_parent()
	form.add_child(remember_check)
	form.move_child(remember_check, 2)
	
	_load_saved_credentials()

func _save_credentials() -> void:
	var config = ConfigFile.new()
	if remember_check and remember_check.button_pressed:
		config.set_value("auth", "username", user_edit.text.strip_edges())
		config.set_value("auth", "password", pass_edit.text)
		config.set_value("auth", "remember_me", true)
	else:
		config.set_value("auth", "remember_me", false)
	config.save("user://auth_credentials.cfg")

func _load_saved_credentials() -> void:
	var config = ConfigFile.new()
	var err = config.load("user://auth_credentials.cfg")
	if err == OK:
		var remember = config.get_value("auth", "remember_me", false)
		if remember_check:
			remember_check.button_pressed = remember
		if remember:
			user_edit.text = config.get_value("auth", "username", "")
			pass_edit.text = config.get_value("auth", "password", "")

func _save_to_known_profiles(username: String, password: String) -> void:
	var config = ConfigFile.new()
	config.load("user://known_profiles.cfg")
	config.set_value("profiles", username, password)
	config.save("user://known_profiles.cfg")

func _setup_known_profiles_ui() -> void:
	var config = ConfigFile.new()
	var err = config.load("user://known_profiles.cfg")
	if err != OK:
		# If we don't have known profiles but have old credentials saved, migrate them!
		var old_config = ConfigFile.new()
		if old_config.load("user://auth_credentials.cfg") == OK:
			var user = old_config.get_value("auth", "username", "")
			var pswd = old_config.get_value("auth", "password", "")
			if not user.is_empty():
				_save_to_known_profiles(user, pswd)
				config.load("user://known_profiles.cfg")
				
	var profiles = []
	if config.has_section("profiles"):
		profiles = config.get_section_keys("profiles")
		
	# Fallback: always ensure the 'dispatch_operator' dev profile is seeded for instant one-click testing
	if not "dispatch_operator" in profiles:
		_save_to_known_profiles("dispatch_operator", "admin123")
		config.load("user://known_profiles.cfg")
		if config.has_section("profiles"):
			profiles = config.get_section_keys("profiles")
			
	if profiles.is_empty():
		return
		
	var parent_container = user_edit.get_parent().get_parent().get_parent() # This is LeftPanel
	
	var profile_box = VBoxContainer.new()
	profile_box.name = "KnownProfilesBox"
	profile_box.add_theme_constant_override("separation", 6)
	
	var label = Label.new()
	label.text = "AUTHORIZED DECKS (QUICK ACCESS):"
	label.add_theme_font_size_override("font_size", 10)
	label.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.45))
	profile_box.add_child(label)
	
	var flow = HFlowContainer.new()
	flow.add_theme_constant_override("h_separation", 8)
	flow.add_theme_constant_override("v_separation", 6)
	profile_box.add_child(flow)
	
	for profile in profiles:
		var chip = Button.new()
		chip.text = "◈ " + profile.to_upper()
		chip.add_theme_font_size_override("font_size", 11)
		
		# Style chip like a sleek cyan indicator
		var chip_style = StyleBoxFlat.new()
		chip_style.bg_color = Color(0.2, 0.9, 0.7, 0.08)
		chip_style.border_color = Color(0.2, 0.9, 0.7, 0.35)
		chip_style.border_width_bottom = 1
		chip_style.border_width_top = 1
		chip_style.border_width_left = 1
		chip_style.border_width_right = 1
		chip_style.set_corner_radius_all(12)
		chip_style.content_margin_left = 10
		chip_style.content_margin_right = 10
		chip_style.content_margin_top = 4
		chip_style.content_margin_bottom = 4
		
		var chip_style_hover = StyleBoxFlat.new()
		chip_style_hover.bg_color = Color(0.2, 0.9, 0.7, 0.2)
		chip_style_hover.border_color = Color(0.2, 0.9, 0.7, 0.8)
		chip_style_hover.border_width_left = 1
		chip_style_hover.border_width_top = 1
		chip_style_hover.border_width_right = 1
		chip_style_hover.border_width_bottom = 1
		chip_style_hover.set_corner_radius_all(12)
		chip_style_hover.content_margin_left = 10
		chip_style_hover.content_margin_right = 10
		chip_style_hover.content_margin_top = 4
		chip_style_hover.content_margin_bottom = 4
		
		chip.add_theme_stylebox_override("normal", chip_style)
		chip.add_theme_stylebox_override("hover", chip_style_hover)
		chip.add_theme_stylebox_override("pressed", chip_style)
		chip.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7))
		
		var saved_pass = config.get_value("profiles", profile, "")
		chip.pressed.connect(func():
			user_edit.text = profile
			pass_edit.text = saved_pass
			if remember_check:
				remember_check.button_pressed = true
			_on_login_pressed()
		)
		flow.add_child(chip)
		
	# Insert in LeftPanel before ButtonBox
	var btn_idx = parent_container.get_node("ButtonBox").get_index()
	parent_container.add_child(profile_box)
	parent_container.move_child(profile_box, btn_idx)

func _setup_developer_bypass_ui() -> void:
	var parent_container = user_edit.get_parent().get_parent() # This is FormContainer
	
	var bypass_btn = Button.new()
	bypass_btn.name = "DevBypassBtn"
	bypass_btn.text = "⚡ DEVELOPER COMMAND ACCESS (QUICK PLAY) ⚡"
	bypass_btn.add_theme_font_size_override("font_size", 12)
	
	# Give it a gorgeous glowing gold/amber cyber-border style
	var style_normal = StyleBoxFlat.new()
	style_normal.bg_color = Color(0.925, 0.607, 0.141, 0.08) # Amber translucent
	style_normal.border_color = Color(0.925, 0.607, 0.141, 0.8) # Full amber border
	style_normal.border_width_left = 1
	style_normal.border_width_top = 1
	style_normal.border_width_right = 1
	style_normal.border_width_bottom = 1
	style_normal.set_corner_radius_all(6)
	style_normal.content_margin_top = 10
	style_normal.content_margin_bottom = 10
	
	var style_hover = StyleBoxFlat.new()
	style_hover.bg_color = Color(0.925, 0.607, 0.141, 0.2) # Stronger gold
	style_hover.border_color = Color(1.0, 0.75, 0.3, 1.0) # Bright gold border
	style_hover.border_width_left = 2
	style_hover.border_width_top = 2
	style_hover.border_width_right = 2
	style_hover.border_width_bottom = 2
	style_hover.set_corner_radius_all(6)
	style_hover.content_margin_top = 9
	style_hover.content_margin_bottom = 9
	
	bypass_btn.add_theme_stylebox_override("normal", style_normal)
	bypass_btn.add_theme_stylebox_override("hover", style_hover)
	bypass_btn.add_theme_stylebox_override("pressed", style_normal)
	bypass_btn.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
	bypass_btn.add_theme_color_override("font_hover_color", Color.WHITE)
	
	parent_container.add_child(bypass_btn)
	# Put it at the very top of FormContainer
	parent_container.move_child(bypass_btn, 0)
	
	bypass_btn.pressed.connect(func():
		user_edit.text = "dispatch_operator"
		pass_edit.text = "admin123"
		if remember_check:
			remember_check.button_pressed = true
		_on_login_pressed()
	)

