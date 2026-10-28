- la regla deberia desactivarse o apagarse al dar a escape o click izquierdo, asi como las mediciones. 
- en la pantalla del mapa, tendria que haber un desplegable con el lanzador de dados + historial para tiradas rapidas
- cuando se mueve un pj, deberia salir tambien la distancia y, igual que con la regla, poder hacer click derecho para girar y click izquierdo para moverlo a destino, o escape para devolverlo al inicio

-las fichas no se sincronizan entre jugadores (el mapa en general)
- la niebla debe tapar completamente lo oculta



# Cosmere RPG Virtual Tabletop (VTT)

Mesa virtual interactiva multijugador para el sistema oficial Cosmere RPG (Brotherwise Games).

## Estructura Modular

```
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
```

## Despliegue en Netlify

1. Descomprime esta carpeta.
2. Arrastra la carpeta completa directamente a [Netlify Drop](https://app.netlify.com/drop).
3. La aplicación estará en línea inmediatamente con soporte HTTPS y conexión a Supabase.
