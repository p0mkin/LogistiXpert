import json
with open('client/resources/cities.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

cities = data['cities']

# 1. Add new intermediate cities
new_cities = {
    'bucharest': {'name': 'Bucharest', 'country': 'Romania', 'is_schengen': True, 'type': 'friendly', 'coords': {'x': 44.42, 'y': 26.10}, 'connections': {
        'budapest': {'distance_km': 800, 'is_border_crossing': True, 'type': 'legal'},
        'kyiv': {'distance_km': 900, 'is_border_crossing': True, 'type': 'legal'},
        'istanbul': {'distance_km': 630, 'is_border_crossing': True, 'type': 'legal'},
        'sofia': {'distance_km': 360, 'is_border_crossing': True, 'type': 'legal'}
    }},
    'sofia': {'name': 'Sofia', 'country': 'Bulgaria', 'is_schengen': True, 'type': 'friendly', 'coords': {'x': 42.69, 'y': 23.32}, 'connections': {
        'bucharest': {'distance_km': 360, 'is_border_crossing': True, 'type': 'legal'},
        'istanbul': {'distance_km': 550, 'is_border_crossing': True, 'type': 'legal'},
        'belgrade': {'distance_km': 390, 'is_border_crossing': True, 'type': 'legal'}
    }},
    'belgrade': {'name': 'Belgrade', 'country': 'Serbia', 'is_schengen': False, 'type': 'high_risk', 'coords': {'x': 44.81, 'y': 20.45}, 'connections': {
        'sofia': {'distance_km': 390, 'is_border_crossing': True, 'type': 'legal'},
        'budapest': {'distance_km': 380, 'is_border_crossing': True, 'type': 'legal'},
        'vienna': {'distance_km': 600, 'is_border_crossing': True, 'type': 'legal'}
    }}
}

for k, v in new_cities.items():
    cities[k] = v

if 'istanbul' in cities:
    if 'kyiv' in cities['istanbul']['connections']:
        del cities['istanbul']['connections']['kyiv']
    if 'vienna' in cities['istanbul']['connections']:
        del cities['istanbul']['connections']['vienna']
    if 'budapest' in cities['istanbul']['connections']:
        del cities['istanbul']['connections']['budapest']
    
    cities['istanbul']['connections']['bucharest'] = {'distance_km': 630, 'is_border_crossing': True, 'type': 'legal'}
    cities['istanbul']['connections']['sofia'] = {'distance_km': 550, 'is_border_crossing': True, 'type': 'legal'}

if 'budapest' in cities:
    if 'istanbul' in cities['budapest']['connections']:
        del cities['budapest']['connections']['istanbul']
    cities['budapest']['connections']['bucharest'] = {'distance_km': 800, 'is_border_crossing': True, 'type': 'legal'}
    cities['budapest']['connections']['belgrade'] = {'distance_km': 380, 'is_border_crossing': True, 'type': 'legal'}

if 'kyiv' in cities:
    if 'istanbul' in cities['kyiv']['connections']:
        del cities['kyiv']['connections']['istanbul']
    cities['kyiv']['connections']['bucharest'] = {'distance_km': 900, 'is_border_crossing': True, 'type': 'legal'}

if 'vienna' in cities:
    if 'istanbul' in cities['vienna']['connections']:
        del cities['vienna']['connections']['istanbul']
    cities['vienna']['connections']['belgrade'] = {'distance_km': 600, 'is_border_crossing': True, 'type': 'legal'}

with open('client/resources/cities.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)

print('Successfully added intermediate cities.')

file_path = 'client/scenes/staff/StaffManager.gd'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('add_theme_font_size_override("font_size", 10.5)', 'add_theme_font_size_override("font_size", 10)')
content = content.replace('add_theme_font_size_override("font_size", 12.5)', 'add_theme_font_size_override("font_size", 12)')
content = content.replace('add_theme_font_size_override("font_size", 9.5)', 'add_theme_font_size_override("font_size", 9)')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed StaffManager.gd float sizes')
