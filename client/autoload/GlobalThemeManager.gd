extends Node

# ====================================================
# GlobalThemeManager.gd
# Applies unified Glassmorphism UI styling across all panels
# ====================================================

var glass_style: StyleBoxFlat
var glass_style_intense: StyleBoxFlat
var glass_style_underworld: StyleBoxFlat
var base_font: Font

func _ready() -> void:
	_init_styles()

func _init_styles() -> void:
	# 1. Standard Glassmorphism (Charcoal/Amber)
	glass_style = StyleBoxFlat.new()
	glass_style.bg_color = Color(0.04, 0.05, 0.06, 0.85)
	glass_style.border_color = Color(0.925, 0.607, 0.141, 0.5) # Neon Amber
	glass_style.border_width_right = 2
	glass_style.border_width_bottom = 2
	glass_style.border_width_left = 1
	glass_style.border_width_top = 1
	glass_style.set_corner_radius_all(12)
	glass_style.shadow_color = Color(0, 0, 0, 0.7)
	glass_style.shadow_size = 24
	glass_style.content_margin_left = 24
	glass_style.content_margin_right = 24
	glass_style.content_margin_top = 24
	glass_style.content_margin_bottom = 24

	# 2. Intense Glassmorphism (Brighter Amber for highlighted panels)
	glass_style_intense = glass_style.duplicate()
	glass_style_intense.border_color = Color(0.925, 0.607, 0.141, 1.0)
	glass_style_intense.shadow_color = Color(0.925, 0.607, 0.141, 0.2)
	glass_style_intense.shadow_size = 32

	# 3. Underworld Glassmorphism (Crimson/Dark Red)
	glass_style_underworld = glass_style.duplicate()
	glass_style_underworld.bg_color = Color(0.06, 0.02, 0.02, 0.9)
	glass_style_underworld.border_color = Color(0.8, 0.1, 0.1, 0.7) # Blood Red
	glass_style_underworld.shadow_color = Color(0.8, 0.1, 0.1, 0.2)
	glass_style_underworld.shadow_size = 30

func apply_glass(panel: Control, style_type: String = "standard") -> void:
	var target_style = glass_style
	if style_type == "intense":
		target_style = glass_style_intense
	elif style_type == "underworld":
		target_style = glass_style_underworld
		
	if panel is PanelContainer or panel is Panel:
		panel.add_theme_stylebox_override("panel", target_style)
	else:
		# SAFE: Never reparent nodes — that destroys % unique-name references and
		# breaks all @onready variables pointing to those nodes in any scene.
		# Instead, apply a canvas-item modulate background via a draw callback.
		push_warning("[GlobalThemeManager] apply_glass: '%s' is not a PanelContainer/Panel. Style not applied to avoid scene-tree corruption." % panel.name)
		# Fallback: at minimum set self-modulate so the node visually darkens
		# (caller should use a PanelContainer wrapper in the scene instead)

func apply_btn_style(btn: Button, color: Color = Color(0.925, 0.607, 0.141)) -> void:
	var style_normal = StyleBoxFlat.new()
	style_normal.bg_color = Color(color.r, color.g, color.b, 0.15)
	style_normal.border_color = Color(color.r, color.g, color.b, 0.6)
	style_normal.border_width_left = 1
	style_normal.border_width_top = 1
	style_normal.border_width_right = 1
	style_normal.border_width_bottom = 1
	style_normal.set_corner_radius_all(8)
	style_normal.content_margin_left = 16
	style_normal.content_margin_right = 16
	style_normal.content_margin_top = 10
	style_normal.content_margin_bottom = 10
	
	var style_hover = style_normal.duplicate()
	style_hover.bg_color = Color(color.r, color.g, color.b, 0.3)
	style_hover.border_color = Color(color.r, color.g, color.b, 1.0)
	style_hover.shadow_color = Color(color.r, color.g, color.b, 0.3)
	style_hover.shadow_size = 12
	
	var style_disabled = StyleBoxFlat.new()
	style_disabled.bg_color = Color(0.08, 0.08, 0.10, 0.4)
	style_disabled.border_color = Color(0.25, 0.25, 0.3, 0.25)
	style_disabled.border_width_left = 1
	style_disabled.border_width_top = 1
	style_disabled.border_width_right = 1
	style_disabled.border_width_bottom = 1
	style_disabled.set_corner_radius_all(8)
	style_disabled.content_margin_left = 16
	style_disabled.content_margin_right = 16
	style_disabled.content_margin_top = 10
	style_disabled.content_margin_bottom = 10
	
	btn.add_theme_stylebox_override("normal", style_normal)
	btn.add_theme_stylebox_override("hover", style_hover)
	btn.add_theme_stylebox_override("pressed", style_normal)
	btn.add_theme_stylebox_override("disabled", style_disabled)
	btn.add_theme_color_override("font_color", color)
	btn.add_theme_color_override("font_hover_color", Color.WHITE)
	btn.add_theme_color_override("font_disabled_color", Color(0.4, 0.4, 0.45, 0.6))

func apply_card_style(panel: Control, accent_color: Color = Color(0.925, 0.607, 0.141)) -> void:
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.04, 0.05, 0.06, 0.9)
	style.border_color = accent_color
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.set_corner_radius_all(10)
	style.shadow_color = Color(0, 0, 0, 0.5)
	style.shadow_size = 10
	if panel is PanelContainer or panel is Panel:
		panel.add_theme_stylebox_override("panel", style)

func apply_tab_style(button: Button, is_active: bool, color: Color = Color(0.925, 0.607, 0.141)) -> void:
	var style = StyleBoxFlat.new()
	if is_active:
		style.bg_color = Color(color.r, color.g, color.b, 0.3)
		style.border_color = color
	else:
		style.bg_color = Color(0.05, 0.05, 0.05, 0.5)
		style.border_color = Color(0.2, 0.2, 0.2, 0.5)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.set_corner_radius_all(4)
	
	button.add_theme_stylebox_override("normal", style)
	button.add_theme_stylebox_override("hover", style)
	button.add_theme_stylebox_override("pressed", style)
	button.add_theme_color_override("font_color", color if is_active else Color(0.6, 0.6, 0.6))

func apply_input_style(line_edit: LineEdit) -> void:
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.02, 0.02, 0.03, 0.95)
	style.border_color = Color(0.925, 0.607, 0.141, 0.4)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.set_corner_radius_all(6)
	line_edit.add_theme_stylebox_override("normal", style)
	line_edit.add_theme_color_override("font_color", Color.WHITE)
