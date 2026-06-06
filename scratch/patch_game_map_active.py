import os

file_path = 'client/scenes/game_map/GameMap.gd'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = """\t\t\t\tif is_active:
\t\t\t\t\tvar is_smuggle = active_route.get("contrabandJobId") != null or active_route.get("isSmuggling", false)

\t\t\t\t\t# 1. Translucent wider solid pipeline backing
\t\t\t\t\tvar backing_color = Color(0.607, 0.349, 0.713, 0.12) if is_smuggle else Color(0.180, 0.803, 0.443, 0.12)
\t\t\t\t\tmap_drawer.draw_line(start_pos, end_pos, backing_color, 8.0 / zoom, true)

\t\t\t\t\t# 2. Solid base line
\t\t\t\t\tvar base_line_color = Color(0.607, 0.349, 0.713, 0.4) if is_smuggle else Color(0.180, 0.803, 0.443, 0.4)
\t\t\t\t\tmap_drawer.draw_line(start_pos, end_pos, base_line_color, 1.5 / zoom, true)

\t\t\t\t\t# 3. Flowing dashed animation core (respects travel direction!)
\t\t\t\t\tvar origin = ""
\t\t\t\t\tvar dest = ""
\t\t\t\t\tif active_route.get("legalContract") != null:
\t\t\t\t\t\torigin = active_route.get("legalContract").get("origin", "").to_lower()
\t\t\t\t\t\tdest = active_route.get("legalContract").get("destination", "").to_lower()
\t\t\t\t\telif active_route.get("contrabandJob") != null:
\t\t\t\t\t\torigin = active_route.get("contrabandJob").get("origin", "").to_lower()
\t\t\t\t\t\tdest = active_route.get("contrabandJob").get("destination", "").to_lower()

\t\t\t\t\tvar flow_from = start_pos
\t\t\t\t\tvar flow_to = end_pos
\t\t\t\t\tif origin == conn_id and dest == city_id:
\t\t\t\t\t\tflow_from = end_pos
\t\t\t\t\t\tflow_to = start_pos

\t\t\t\t\tvar flow_color = Color(0.75, 0.45, 1.0, 0.95) if is_smuggle else Color(0.2, 0.95, 0.5, 0.95)
\t\t\t\t\t_draw_dashed_line(flow_from, flow_to, flow_color, 2.0 / zoom, 8.0 / zoom, 6.0 / zoom, time_passed * 42.0)"""

new_logic = """\t\t\t\tif is_active:
\t\t\t\t\tvar is_smuggle = active_route.get("contrabandJobId") != null or active_route.get("isSmuggling", false)
\t\t\t\t\tvar is_tunnel = (city_id == "london" and conn_id == "paris") or (city_id == "paris" and conn_id == "london")
\t\t\t\t\tvar sea_routes = ["stockholm_tallinn", "stockholm_gdansk", "helsinki_tallinn", "turku_stockholm", "stockholm_turku", "visby_stockholm", "visby_riga", "visby_klaipeda", "oslo_copenhagen", "stockholm_oslo"]
\t\t\t\t\tvar is_sea_route = sea_routes.has(city_id + "_" + conn_id) or sea_routes.has(conn_id + "_" + city_id)
\t\t\t\t\tvar fuel_routes = ["istanbul_ankara", "ankara_tehran", "tehran_kabul", "ankara_baghdad", "baghdad_riyadh", "riyadh_dubai", "tehran_dubai"]
\t\t\t\t\tvar is_fuel_route = fuel_routes.has(city_id + "_" + conn_id) or fuel_routes.has(conn_id + "_" + city_id)

\t\t\t\t\t# 1. Translucent wider solid pipeline backing
\t\t\t\t\tvar backing_color = Color(0.607, 0.349, 0.713, 0.12) if is_smuggle else Color(0.180, 0.803, 0.443, 0.12)
\t\t\t\t\tif is_tunnel: backing_color = Color(0.78, 0.20, 1.0, 0.2)
\t\t\t\t\tif is_fuel_route: backing_color = Color(1.0, 0.84, 0.0, 0.25)
\t\t\t\t\tmap_drawer.draw_line(start_pos, end_pos, backing_color, 8.0 / zoom, true)

\t\t\t\t\t# 2. Solid base line
\t\t\t\t\tvar base_line_color = Color(0.607, 0.349, 0.713, 0.4) if is_smuggle else Color(0.180, 0.803, 0.443, 0.4)
\t\t\t\t\tif is_tunnel: base_line_color = Color(0.78, 0.20, 1.0, 0.5)
\t\t\t\t\tif is_fuel_route: base_line_color = Color(1.0, 0.84, 0.0, 0.6)
\t\t\t\t\tmap_drawer.draw_line(start_pos, end_pos, base_line_color, 1.5 / zoom, true)

\t\t\t\t\t# 3. Flowing dashed animation core (respects travel direction!)
\t\t\t\t\tvar origin = ""
\t\t\t\t\tvar dest = ""
\t\t\t\t\tif active_route.get("legalContract") != null:
\t\t\t\t\t\torigin = active_route.get("legalContract").get("origin", "").to_lower()
\t\t\t\t\t\tdest = active_route.get("legalContract").get("destination", "").to_lower()
\t\t\t\t\telif active_route.get("contrabandJob") != null:
\t\t\t\t\t\torigin = active_route.get("contrabandJob").get("origin", "").to_lower()
\t\t\t\t\t\tdest = active_route.get("contrabandJob").get("destination", "").to_lower()

\t\t\t\t\tvar flow_from = start_pos
\t\t\t\t\tvar flow_to = end_pos
\t\t\t\t\tif origin == conn_id and dest == city_id:
\t\t\t\t\t\tflow_from = end_pos
\t\t\t\t\t\tflow_to = start_pos

\t\t\t\t\tvar flow_color = Color(0.75, 0.45, 1.0, 0.95) if is_smuggle else Color(0.2, 0.95, 0.5, 0.95)
\t\t\t\t\tif is_tunnel: flow_color = Color(0.85, 0.40, 1.0, 0.95)
\t\t\t\t\tif is_fuel_route: flow_color = Color(1.0, 0.90, 0.20, 0.95)
\t\t\t\t\t_draw_dashed_line(flow_from, flow_to, flow_color, 2.0 / zoom, 8.0 / zoom, 6.0 / zoom, time_passed * 42.0)"""

if old_logic in content:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content.replace(old_logic, new_logic))
    print('Successfully patched GameMap.gd active drawing logic.')
else:
    print('Failed to find target string in GameMap.gd for active routing.')
