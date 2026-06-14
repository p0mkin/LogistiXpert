extends Node

# ====================================================
# JuiceEngine.gd
# Handles UI animations, satisfying sounds, and tweening
# ====================================================

var audio_players: Array = []
var next_player_idx: int = 0
const MAX_AUDIO_PLAYERS = 8

func _ready() -> void:
	for i in range(MAX_AUDIO_PLAYERS):
		var asp = AudioStreamPlayer.new()
		asp.bus = "Master"
		add_child(asp)
		audio_players.append(asp)
	
# Safe fade-in for scene roots and full-screen controls.
# Does NOT modify scale — scaling a root Control in Godot 4 breaks mouse input rects.
func tween_in(node: Control, delay: float = 0.0) -> void:
	if not node: return
	
	node.modulate.a = 0.0
	
	var tween = create_tween()
	tween.tween_property(node, "modulate:a", 1.0, 0.35).set_delay(delay).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)

# Scale-pop fade-in — safe ONLY for non-root child nodes (panels, cards, overlays).
# Do NOT call this on scene root Controls — use tween_in() instead.
func tween_in_child(node: Control, delay: float = 0.0) -> void:
	if not node: return
	
	node.modulate.a = 0.0
	node.scale = Vector2(0.92, 0.92)
	if node.pivot_offset == Vector2.ZERO:
		node.pivot_offset = node.size * 0.5
	
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
	match type:
		"click":
			_play_synth_sound(600.0, 0.08, -5.0)
		"success":
			_play_synth_sound(440.0, 0.06, -5.0)
			await get_tree().create_timer(0.06).timeout
			_play_synth_sound(880.0, 0.14, -5.0)
		"error":
			_play_custom_synth_sweep(180.0, 60.0, 0.25, -2.0, "SAW")
		"heavy":
			_play_custom_synth_sweep(120.0, 40.0, 0.4, 0.0, "SAW")
		"chaching":
			_play_synth_sound(880.0, 0.05, -3.0)
			await get_tree().create_timer(0.04).timeout
			_play_synth_sound(1046.5, 0.05, -3.0)
			await get_tree().create_timer(0.04).timeout
			_play_synth_sound(1318.5, 0.15, -3.0)
		"alarm":
			_play_custom_synth_sweep(880.0, 440.0, 0.3, -2.0, "SAW")
			await get_tree().create_timer(0.15).timeout
			_play_custom_synth_sweep(880.0, 440.0, 0.3, -2.0, "SAW")

func _play_synth_sound(hz: float, duration: float, volume_db: float = 0.0) -> void:
	if audio_players.is_empty(): return
	var player: AudioStreamPlayer = audio_players[next_player_idx]
	next_player_idx = (next_player_idx + 1) % MAX_AUDIO_PLAYERS
	
	var stream = AudioStreamGenerator.new()
	stream.mix_rate = 44100
	stream.buffer_length = duration
	
	player.stream = stream
	player.volume_db = volume_db
	player.play()
	
	var playback: AudioStreamGeneratorPlayback = player.get_stream_playback()
	if playback:
		_fill_audio_buffer(playback, hz, duration)

func _fill_audio_buffer(playback: AudioStreamGeneratorPlayback, hz: float, duration: float) -> void:
	var mix_rate = 44100.0
	var total_frames = int(mix_rate * duration)
	var phase = 0.0
	var phase_inc = hz / mix_rate
	
	var frames_written = 0
	while frames_written < total_frames and playback.can_push_buffer(1):
		var env = 1.0 - (float(frames_written) / float(total_frames))
		var sample = sin(phase * TAU) * env * 0.2
		playback.push_frame(Vector2(sample, sample))
		phase = fmod(phase + phase_inc, 1.0)
		frames_written += 1

func _play_custom_synth_sweep(start_hz: float, end_hz: float, duration: float, volume_db: float = 0.0, type: String = "SINE") -> void:
	if audio_players.is_empty(): return
	var player: AudioStreamPlayer = audio_players[next_player_idx]
	next_player_idx = (next_player_idx + 1) % MAX_AUDIO_PLAYERS
	
	var stream = AudioStreamGenerator.new()
	stream.mix_rate = 44100
	stream.buffer_length = duration
	
	player.stream = stream
	player.volume_db = volume_db
	player.play()
	
	var playback: AudioStreamGeneratorPlayback = player.get_stream_playback()
	if playback:
		_fill_custom_audio_buffer(playback, start_hz, end_hz, duration, type)

func _fill_custom_audio_buffer(playback: AudioStreamGeneratorPlayback, start_hz: float, end_hz: float, duration: float, type: String) -> void:
	var mix_rate = 44100.0
	var total_frames = int(mix_rate * duration)
	var phase = 0.0
	
	var frames_written = 0
	while frames_written < total_frames and playback.can_push_buffer(1):
		var t = float(frames_written) / float(total_frames)
		var env = 1.0 - t
		
		var current_hz = lerp(start_hz, end_hz, t)
		var phase_inc = current_hz / mix_rate
		
		var sample = 0.0
		if type == "SAW":
			sample = (phase * 2.0 - 1.0) * env * 0.15
		elif type == "TRIANGLE":
			sample = (abs(phase * 2.0 - 1.0) * 2.0 - 1.0) * env * 0.18
		else:
			sample = sin(phase * TAU) * env * 0.2
			
		playback.push_frame(Vector2(sample, sample))
		phase = fmod(phase + phase_inc, 1.0)
		frames_written += 1

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

func tween_stagger_children(parent: Control, delay_per: float = 0.05) -> void:
	if not parent: return
	var idx = 0
	for child in parent.get_children():
		if child is Control:
			child.modulate.a = 0.0
			var tween = create_tween()
			tween.tween_property(child, "modulate:a", 1.0, 0.25).set_delay(idx * delay_per).set_ease(Tween.EASE_OUT)
			idx += 1

func flash_border(node: Control, color: Color = Color.WHITE) -> void:
	if not node: return
	var original_mod = node.modulate
	var tween = create_tween()
	tween.tween_property(node, "modulate", color * 1.5, 0.15)
	tween.tween_property(node, "modulate", original_mod, 0.15)
