extends Control

@onready var user_edit: LineEdit = %UserEdit
@onready var pass_edit: LineEdit = %PassEdit
@onready var login_btn: Button = %LoginBtn
@onready var register_btn: Button = %RegisterBtn
@onready var status_label: Label = %StatusLabel

func _ready() -> void:
	# Build sleek custom styling entirely in code to avoid heavy binary assets
	_apply_visual_theme()
	
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
			_set_status("Access Granted. Routing database state...", Color(0.180, 0.803, 0.443))
			# Wait a split second to see the success message before loading map
			await get_tree().create_timer(0.6).timeout
			get_tree().change_scene_to_file("res://scenes/game_map/GameMap.tscn")
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
