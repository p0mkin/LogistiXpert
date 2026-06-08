extends Node

# ====================================================
# JuiceEngine.gd
# Handles UI animations, satisfying sounds, and tweening
# ====================================================

var audio_player: AudioStreamPlayer

func _ready() -> void:
	audio_player = AudioStreamPlayer.new()
	add_child(audio_player)
	
func tween_in(node: Control, delay: float = 0.0) -> void:
	if not node: return
	
	node.modulate.a = 0.0
	node.scale = Vector2(0.9, 0.9)
	
	var tween = create_tween().set_parallel(true)
	tween.tween_property(node, "modulate:a", 1.0, 0.3).set_delay(delay).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tween.tween_property(node, "scale", Vector2.ONE, 0.4).set_delay(delay).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)

func tween_slide_in(node: Control, from_direction: Vector2 = Vector2(-50, 0), delay: float = 0.0) -> void:
	if not node: return
	
	var final_pos = node.position
	node.position += from_direction
	node.modulate.a = 0.0
	
	var tween = create_tween().set_parallel(true)
	tween.tween_property(node, "position", final_pos, 0.4).set_delay(delay).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_EXPO)
	tween.tween_property(node, "modulate:a", 1.0, 0.3).set_delay(delay).set_ease(Tween.EASE_OUT)

func pop_attention(node: Control) -> void:
	if not node: return
	var tween = create_tween()
	tween.tween_property(node, "scale", Vector2(1.1, 1.1), 0.1).set_ease(Tween.EASE_OUT)
	tween.tween_property(node, "scale", Vector2.ONE, 0.2).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_ELASTIC)

func play_sound(type: String) -> void:
	# In a full game, we load actual .ogg files. For now, we will use procedural audio if we can,
	# or just connect to the existing UIEffects if it exists.
	if get_node_or_null("/root/UIEffects"):
		var ui = get_node("/root/UIEffects")
		match type:
			"click":
				if ui.has_method("play_click"): ui.play_click()
			"success":
				if ui.has_method("play_success"): ui.play_success()
			"error":
				if ui.has_method("play_error"): ui.play_error()
			"heavy":
				if ui.has_method("play_click"): ui.play_click() # Fallback

func show_splash_text(text: String, color: Color = Color.WHITE) -> void:
	var canvas = CanvasLayer.new()
	canvas.layer = 120
	get_tree().root.add_child(canvas)
	
	var lbl = Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", 64)
	lbl.add_theme_color_override("font_color", color)
	
	# Add shadow
	lbl.add_theme_color_override("font_shadow_color", Color.BLACK)
	lbl.add_theme_constant_override("shadow_offset_x", 4)
	lbl.add_theme_constant_override("shadow_offset_y", 4)
	
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lbl.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	
	canvas.add_child(lbl)
	
	# Animate!
	lbl.scale = Vector2(0.2, 0.2)
	lbl.modulate.a = 0.0
	lbl.pivot_offset = Vector2(640, 360) # Assuming 1280x720 screen center
	
	var tween = create_tween().set_parallel(true)
	tween.tween_property(lbl, "scale", Vector2.ONE, 0.5).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	tween.tween_property(lbl, "modulate:a", 1.0, 0.2)
	
	var tween2 = create_tween()
	tween2.tween_interval(1.5)
	tween2.tween_property(lbl, "modulate:a", 0.0, 0.3)
	tween2.tween_property(lbl, "scale", Vector2(1.2, 1.2), 0.3).set_ease(Tween.EASE_IN)
	tween2.tween_callback(canvas.queue_free)
