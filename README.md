# Cosmere RPG Virtual Tabletop (VTT)

Mesa virtual interactiva multijugador para el sistema oficial Cosmere RPG (Brotherwise Games).

## Estructura Modular
├── index.html          # Interfaz principal y sistema de pestañas
├── css/
│   └── styles.css      # Estilos personalizados (pips, scrollbars, escudo)
└── js/
    ├── supabase.js     # Configuración y utilidades del cliente Supabase
    ├── state.js        # Estado global centralizado
    ├── sheet.js        # Lógica de la ficha, atributos, vitales y autoguardado
    ├── dice.js         # Motor de tiradas (d20, trama, DC, rollback)
    ├── map.js          # Lienzo táctico, tokens y niebla de guerra (Fog of War)
    ├── gallery.js      # Archivo de arte, criaturas y lore
    └── main.js         # Punto de entrada y gestión de eventos
