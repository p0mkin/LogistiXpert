extends Node

# UIEffects.gd
# Universal UI polish manager. Injects AAA-feeling micro-animations and
# generated synthesized audio to all UI elements automatically.

var audio_players: Array = []
var next_player_idx: int = 0
const MAX_AUDIO_PLAYERS = 8

func _ready() -> void:
	# Create an object pool of AudioStreamPlayers for overlapping sounds
	for i in range(MAX_AUDIO_PLAYERS):
		var asp = AudioStreamPlayer.new()
		asp.bus = "Master"
		add_child(asp)
		audio_players.append(asp)
	
	# Connect to the SceneTree to detect new nodes entering the tree
	get_tree().node_added.connect(_on_node_added)
	
	# Process existing nodes (in case Autoload was initialized after them)
	_scan_children(get_tree().root)

func _scan_children(node: Node) -> void:
	_on_node_added(node)
	for child in node.get_children():
		_scan_children(child)

func _on_node_added(node: Node) -> void:
	# We only target Control nodes
	if node is Button:
		_bind_button_effects(node as Button)

# ==========================================
# BUTTON BINDINGS & ANIMATIONS
# ==========================================
func _bind_button_effects(btn: Button) -> void:
	# Avoid binding multiple times
	if btn.has_meta("ui_effects_bound"):
		return
	btn.set_meta("ui_effects_bound", true)
	
	# Set pivot offset to center so scaling scales outward from middle
	btn.pivot_offset = btn.size / 2.0
	btn.resized.connect(func(): btn.pivot_offset = btn.size / 2.0)
	
	btn.mouse_entered.connect(_on_btn_hover.bind(btn))
	btn.mouse_exited.connect(_on_btn_unhover.bind(btn))
	btn.button_down.connect(_on_btn_down.bind(btn))
	btn.button_up.connect(_on_btn_up.bind(btn))
	btn.pressed.connect(_on_btn_pressed.bind(btn))

func _on_btn_hover(btn: Button) -> void:
	if btn.disabled: return
	_play_synth_sound(400.0, 0.05, 0.1) # Soft high blip
	
	var tween = create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(btn, "scale", Vector2(1.04, 1.04), 0.15)
	tween.parallel().tween_property(btn, "modulate", Color(1.2, 1.2, 1.2, 1.0), 0.15)

func _on_btn_unhover(btn: Button) -> void:
	if btn.disabled: return
	var tween = create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(btn, "scale", Vector2(1.0, 1.0), 0.2)
	tween.parallel().tween_property(btn, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.2)

func _on_btn_down(btn: Button) -> void:
	if btn.disabled: return
	var tween = create_tween().set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
	tween.tween_property(btn, "scale", Vector2(0.96, 0.96), 0.05)
	tween.parallel().tween_property(btn, "modulate", Color(0.8, 0.8, 0.8, 1.0), 0.05)

func _on_btn_up(btn: Button) -> void:
	if btn.disabled: return
	# Return to hover state
	var tween = create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(btn, "scale", Vector2(1.04, 1.04), 0.15)
	tween.parallel().tween_property(btn, "modulate", Color(1.2, 1.2, 1.2, 1.0), 0.15)

func _on_btn_pressed(btn: Button) -> void:
	# Click confirm sound
	_play_synth_sound(600.0, 0.1, 0.4)
	
	# Flash effect
	var flash = ColorRect.new()
	flash.color = Color(1.0, 1.0, 1.0, 0.4)
	flash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	btn.add_child(flash)
	
	var tween = create_tween()
	tween.tween_property(flash, "modulate:a", 0.0, 0.25)
	tween.tween_callback(flash.queue_free)

# ==========================================
# PROCEDURAL AUDIO SYNTHESIZER
# ==========================================
# We use an AudioStreamGenerator to mathematically generate simple UI sounds
# without needing any external .wav asset dependencies.

# --- Premium Audio Presets ---
func play_click() -> void:
	_play_synth_sound(600.0, 0.08, 0.0)

func play_error() -> void:
	_play_custom_synth_sweep(180.0, 60.0, 0.25, -2.0, "SAW")

func play_success() -> void:
	_play_synth_sound(440.0, 0.06, 0.0)
	await get_tree().create_timer(0.06).timeout
	_play_synth_sound(880.0, 0.14, 0.0)

func play_smuggle() -> void:
	_play_custom_synth_sweep(350.0, 700.0, 0.3, -3.0, "TRIANGLE")

func play_refuel() -> void:
	# Simulates bubbling/refilling fuel tones
	for i in range(3):
		_play_synth_sound(300.0 + i * 140.0, 0.05, -5.0)
		await get_tree().create_timer(0.045).timeout

# --- Low-Level Generators ---
func _play_synth_sound(hz: float, duration: float, volume_db: float = 0.0) -> void:
	var player: AudioStreamPlayer = audio_players[next_player_idx]
	next_player_idx = (next_player_idx + 1) % MAX_AUDIO_PLAYERS
	
	var stream = AudioStreamGenerator.new()
	stream.mix_rate = 44100
	stream.buffer_length = duration
	
	player.stream = stream
	player.volume_db = volume_db
	player.play()
	
	var playback: AudioStreamGeneratorPlayback = player.get_stream_playback()
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
	var player: AudioStreamPlayer = audio_players[next_player_idx]
	next_player_idx = (next_player_idx + 1) % MAX_AUDIO_PLAYERS
	
	var stream = AudioStreamGenerator.new()
	stream.mix_rate = 44100
	stream.buffer_length = duration
	
	player.stream = stream
	player.volume_db = volume_db
	player.play()
	
	var playback: AudioStreamGeneratorPlayback = player.get_stream_playback()
	_fill_custom_audio_buffer(playback, start_hz, end_hz, duration, type)

func _fill_custom_audio_buffer(playback: AudioStreamGeneratorPlayback, start_hz: float, end_hz: float, duration: float, type: String) -> void:
	var mix_rate = 44100.0
	var total_frames = int(mix_rate * duration)
	var phase = 0.0
	
	var frames_written = 0
	while frames_written < total_frames and playback.can_push_buffer(1):
		var t = float(frames_written) / float(total_frames)
		var env = 1.0 - t
		
		# Pitch sweep calculation
		var current_hz = lerp(start_hz, end_hz, t)
		var phase_inc = current_hz / mix_rate
		
		var sample = 0.0
		if type == "SAW":
			sample = (phase * 2.0 - 1.0) * env * 0.15
		elif type == "TRIANGLE":
			sample = (abs(phase * 2.0 - 1.0) * 2.0 - 1.0) * env * 0.18
		else: # SINE
			sample = sin(phase * TAU) * env * 0.2
			
		playback.push_frame(Vector2(sample, sample))
		phase = fmod(phase + phase_inc, 1.0)
		frames_written += 1
