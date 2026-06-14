extends CanvasLayer
class_name DriverRoster

var panel: PanelContainer
var drivers_container: VBoxContainer

func _ready() -> void:
    self.layer = 90
    
    panel = PanelContainer.new()
    panel.custom_minimum_size = Vector2(800, 500)
    panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
    add_child(panel)
    
    var style = StyleBoxFlat.new()
    style.bg_color = Color(0.05, 0.06, 0.08, 0.95)
    style.border_color = Color(0.9, 0.7, 0.2, 0.6)
    style.border_width_left = 2
    style.border_width_right = 2
    style.border_width_top = 2
    style.border_width_bottom = 2
    style.set_corner_radius_all(12)
    panel.add_theme_stylebox_override("panel", style)
    
    var vbox = VBoxContainer.new()
    panel.add_child(vbox)
    
    var header = Label.new()
    header.text = "👥 DRIVER ROSTER & SYNDICATE OPERATIVES"
    header.add_theme_font_size_override("font_size", 18)
    header.add_theme_color_override("font_color", Color(0.9, 0.7, 0.2))
    header.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    vbox.add_child(header)
    
    var scroll = ScrollContainer.new()
    scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
    vbox.add_child(scroll)
    
    drivers_container = VBoxContainer.new()
    drivers_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    scroll.add_child(drivers_container)
    
    var hire_btn = Button.new()
    hire_btn.text = "HIRE NEW DRIVER ($2500)"
    hire_btn.custom_minimum_size = Vector2(300, 40)
    hire_btn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
    var hire_st = StyleBoxFlat.new()
    hire_st.bg_color = Color(0.1, 0.4, 0.2, 0.8)
    hire_st.set_corner_radius_all(8)
    hire_btn.add_theme_stylebox_override("normal", hire_st)
    hire_btn.pressed.connect(_hire_driver)
    vbox.add_child(hire_btn)
    
    var close_btn = Button.new()
    close_btn.text = "CLOSE"
    close_btn.pressed.connect(queue_free)
    vbox.add_child(close_btn)
    
    _fetch_drivers()

func _fetch_drivers() -> void:
    var http = HTTPRequest.new()
    add_child(http)
    http.request_completed.connect(func(_r, code, _h, body):
        if code == 200:
            var drivers = JSON.parse_string(body.get_string_from_utf8())
            _render_drivers(drivers)
        http.queue_free()
    )
    http.request(NetworkManager.HTTP_URL + "/driver", ["Authorization: Bearer " + GameState.auth_token])

func _hire_driver() -> void:
    var http = HTTPRequest.new()
    add_child(http)
    http.request_completed.connect(func(_r, code, _h, body):
        if code == 200:
            _fetch_drivers()
        http.queue_free()
    )
    http.request(NetworkManager.HTTP_URL + "/driver/hire", ["Content-Type: application/json", "Authorization: Bearer " + GameState.auth_token], HTTPClient.METHOD_POST, "{}")

const TRAIT_TOOLTIPS = {
	"BALANCED": "BALANCED: Standard driver. No special buffs or penalties.",
	"LEAD_FOOT": "LEAD_FOOT: +20% travel speed but +15% fuel consumption and +25% barricade run success.",
	"SLEEP_DEPRIVED": "SLEEP_DEPRIVED: Sleep fatigue grows +25% slower but has a 10% chance of triggering microsleep crash events at high fatigue.",
	"LOYAL": "LOYAL: Will never snitch to the police when impounded/busted. Can administer stimulants without loyalty loss.",
	"CHARISMATIC": "CHARISMATIC: +1.5% success chance per charisma point during border crossing bribes (up to +30%)."
}

func _render_drivers(drivers: Array) -> void:
    for c in drivers_container.get_children():
        c.queue_free()
        
    for d in drivers:
        var card = PanelContainer.new()
        var st = StyleBoxFlat.new()
        st.bg_color = Color(0.1, 0.1, 0.12, 0.8)
        card.add_theme_stylebox_override("panel", st)
        drivers_container.add_child(card)
        
        var hb = HBoxContainer.new()
        card.add_child(hb)
        
        var info = Label.new()
        var level = int(d.get("level", 1))
        var xp = int(d.get("xp", 0))
        var tacho = float(d.get("tachoHours", 0.0))
        var stimulated = bool(d.get("isStimulated", false))
        
        info.text = "👤 %s [Lvl %d (XP: %d/%d)] | Trait: %s\nCharisma: %d | Loyalty: %d | Fatigue: %d%%" % [
            d.name, level, xp, level * 100, d.trait, d.charisma, d.loyalty, d.fatigue
        ]
        info.add_theme_font_size_override("font_size", 14)
        info.mouse_filter = Control.MOUSE_FILTER_PASS
        var trait_name = str(d.trait).to_upper()
        if trait_name in TRAIT_TOOLTIPS:
            info.tooltip_text = TRAIT_TOOLTIPS[trait_name]
        hb.add_child(info)

        # Add a spacer
        var hs = Control.new()
        hs.size_flags_horizontal = Control.SIZE_EXPAND_FILL
        hb.add_child(hs)

        # Add Tacho / Stimulated indicators
        var tacho_lbl = Label.new()
        tacho_lbl.text = "Tacho: %.1f/10.0h%s" % [tacho, " ⚗" if stimulated else ""]
        tacho_lbl.add_theme_font_size_override("font_size", 13)
        if tacho > 10.0:
            tacho_lbl.add_theme_color_override("font_color", Color(1.0, 0.5, 0.0, 1.0)) # Warning Orange
            # Pulse/Flash effect
            var t = tacho_lbl.create_tween().set_loops()
            t.tween_property(tacho_lbl, "modulate:a", 0.4, 0.4)
            t.tween_property(tacho_lbl, "modulate:a", 1.0, 0.4)
        else:
            tacho_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.85))
        hb.add_child(tacho_lbl)
        
        # Spacer
        var hs2 = Control.new()
        hs2.custom_minimum_size = Vector2(10, 0)
        hb.add_child(hs2)
