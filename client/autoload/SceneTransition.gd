extends Node

# SceneTransition.gd
# Universal smooth loading system with glassmorphic visuals, dynamic micro-animations,
# procedural sweeping audio transitions, and context-aware gameplay intelligence tips.

var _layer: CanvasLayer = null
var _overlay: PanelContainer = null
var _spinner: Control = null
var _tip_lbl: Label = null
var _status_lbl: Label = null
var _anim_time: float = 0.0
var _is_transitioning: bool = false

# Premium deep space palette
const OVERLAY_COLOR_SOLID = Color(0.047, 0.051, 0.059, 1.0)
const OVERLAY_COLOR_TRANS = Color(0.047, 0.051, 0.059, 0.0)
const ACCENT_AMBER = Color(0.925, 0.607, 0.141, 1.0)
const ACCENT_BLUE = Color(0.0, 0.6, 1.0, 1.0)
const ACCENT_PURPLE = Color(0.607, 0.349, 0.713, 1.0)

# Random gameplay intelligence/strategy tips for operators
const TIPS = [
	"🛡️ [SAFE Autopilot] pulls over completely during thick fog, reducing progress but eliminating all weather accident risks.",
	"🔥 [GREEDY Autopilot] will attempt to run border barricades on smuggling routes. High-risk, but massive time skips if successful!",
	"⚖️ [AVERAGE Autopilot] uses the driver's combined charisma and loyalty skills to negotiate thick fog or ice storms.",
	"💸 Bribing border guards requires CLEAN CASH. The black market's dirty cash cannot be wired directly to custom officers.",
	"💊 Subscribing drivers to Substance Suppression prevents sleep wrecks, but high fatigue drops their efficiency and speed.",
	"⚙️ Running vehicles on engines below 15% health runs the risk of emergency breakdowns. Pre-emptive mechanical overhauls save lives.",
	"📦 PERSISTENT supply-line contracts remain on the board indefinitely, allowing multiple co-op dispatchers to loop trucks on repeat.",
	"❄️ ICE STORMS inflict COSMETIC DAMAGE to trucks, which directly depreciates vehicle auction prices and corporate valuations.",
	"🌫️ THICK FOG halves vehicle transit speeds. Adapt your driver autopilot policy to safe or greedy to survive regional delays."
]

func _ready() -> void:
	# Build the CanvasLayer overlay dynamically so it persists globally
	_layer = CanvasLayer.new()
	_layer.layer = 120 # Just below emergency critical alerts (128) but above standard HUDs
	add_child(_layer)
	
	# Full screen glass container
	_overlay = PanelContainer.new()
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.modulate.a = 0.0
	_overlay.visible = false
	
	# Premium dark styling with deep carbon backdrop and neon border trim
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.039, 0.047, 0.96)
	style.border_color = Color(0.925, 0.607, 0.141, 0.1)
	style.border_width_top = 2
	style.border_width_bottom = 2
	_overlay.add_theme_stylebox_override("panel", style)
	_layer.add_child(_overlay)
	
	# Center elements
	var center = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.add_child(center)
	
	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 24)
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_child(vbox)
	
	# Custom Vector Spinner Node
	_spinner = Control.new()
	_spinner.custom_minimum_size = Vector2(80, 80)
	_spinner.draw.connect(_on_draw_spinner)
	vbox.add_child(_spinner)
	
	# Transition status title
	_status_lbl = Label.new()
	_status_lbl.text = "ESTABLISHING SECURE DATALINK..."
	_status_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status_lbl.add_theme_font_size_override("font_size", 13)
	_status_lbl.add_theme_color_override("font_color", ACCENT_AMBER)
	_status_lbl.add_theme_constant_override("outline_size", 1)
	vbox.add_child(_status_lbl)
	
	# Divider line
	var div = ColorRect.new()
	div.custom_minimum_size = Vector2(320, 1)
	div.color = Color(0.709, 0.768, 0.843, 0.12)
	div.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	vbox.add_child(div)
	
	# Strategy hint/tips label
	_tip_lbl = Label.new()
	_tip_lbl.text = ""
	_tip_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_tip_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_tip_lbl.custom_minimum_size = Vector2(480, 50)
	_tip_lbl.add_theme_font_size_override("font_size", 11)
	_tip_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.7))
	vbox.add_child(_tip_lbl)
	
	set_process(false)

func _process(delta: float) -> void:
	_anim_time += delta
	_spinner.queue_redraw()
	
	# Soft pulse status label
	_status_lbl.modulate.a = 0.5 + sin(_anim_time * 6.0) * 0.35

func _on_draw_spinner() -> void:
	var center_pt = _spinner.size / 2.0
	var radius = 28.0
	
	# Inner glowing orbit
	_spinner.draw_arc(center_pt, radius - 4.0, 0.0, TAU, 32, Color(0.925, 0.607, 0.141, 0.05), 1.0)
	
	# Outer spinning dash orbits (radar style)
	var start_angle = _anim_time * 4.0
	var end_angle = start_angle + PI * 0.7
	_spinner.draw_arc(center_pt, radius, start_angle, end_angle, 24, ACCENT_AMBER, 3.0)
	
	# Counter spinning sweep
	var start_angle2 = -_anim_time * 2.5
	var end_angle2 = start_angle2 + PI * 0.4
	_spinner.draw_arc(center_pt, radius + 6.0, start_angle2, end_angle2, 16, Color(0.709, 0.768, 0.843, 0.4), 1.5)
	
	# Core dot
	_spinner.draw_circle(center_pt, 4.0, ACCENT_AMBER)

# ==========================================
# UNIVERSAL TRANSITION HANDLER
# ==========================================
func change_scene_to_file(scene_path: String, status_text: String = "ESTABLISHING SECURE DATALINK...") -> void:
	if _is_transitioning:
		return
	_is_transitioning = true
	
	# Assign status texts and pick a random gameplay advice
	_status_lbl.text = status_text.to_upper()
	_tip_lbl.text = TIPS[randi() % TIPS.size()]
	
	# Play dynamic soft transition swoop sound
	UIEffects._play_synth_sound(280.0, 0.35, -4.0)
	UIEffects._play_synth_sound(560.0, 0.20, -10.0)
	
	_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	_overlay.visible = true
	set_process(true)
	
	# Fade out current scene (fade in black loading shield)
	var fade_out = create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	fade_out.tween_property(_overlay, "modulate:a", 1.0, 0.3)
	await fade_out.finished
	
	# Run the scene tree transition
	var err = get_tree().change_scene_to_file(scene_path)
	if err != OK:
		print("[SceneTransition] Scene swap error: ", err)
		_status_lbl.text = "TRANSITION CRITICAL RECOVERY ERROR"
		_is_transitioning = false
		_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_overlay.visible = false
		set_process(false)
		return
		
	# Wait brief loading buffer to establish telemetry frames
	await get_tree().create_timer(0.45).timeout
	
	# Play high tone blip on successful handshake loading
	UIEffects._play_synth_sound(880.0, 0.08, -6.0)
	
	# Fade out loading shield to reveal fresh scene
	var fade_in = create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	fade_in.tween_property(_overlay, "modulate:a", 0.0, 0.25)
	await fade_in.finished
	
	_overlay.visible = false
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_process(false)
	_is_transitioning = false
