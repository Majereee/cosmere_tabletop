export const state = {
  myUserId: localStorage.getItem('cosmere_user_uid') || (() => {
    const id = 'user_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('cosmere_user_uid', id);
    return id;
  })(),
  currentRoom: (localStorage.getItem('cosmere_room_id') || "ROSHAR-1").toUpperCase().trim(),
  currentCharacterId: 'none',
  currentCharacter: null,
  availableCharacters: [],
  onlineUsers: {},
  roomRolls: [],
  rollFilter: 'all',
  realtimeChannel: null,
  
  // Roller
  currentMode: 'normal',
  plotEnabled: true,
  dcEnabled: false,

  // Map state
  mapTool: 'move', // 'move' | 'ruler' | 'reveal' | 'hide'
  showGrid: true,
  tokens: {},      // { [charId]: { id, name, x, y, radius, color } }
  fogGrid: {},     // { "x_y": true/false }
  mapBgUrl: '',
  zoom: 1.0,
  panX: 0,
  panY: 0,
  
  // Ruler state
  rulerPoints: [],
  rulerCurrent: null
};

export function isGM() {
  return state.currentCharacterId === 'gm';
}

export function getBlankSheet(name = "Nuevo Aventurero") {
  return {
    profile: { name: name, heritage: "", level: 1, path: "", bond: "" },
    attributes: { fue: 0, vel: 0, int: 0, vol: 0, dis: 0, pre: 0 },
    defenses: { fisica: 10, cognitiva: 10, espiritual: 10 },
    vitals: { hpMax: 20, hpCurrent: 20, desvio: 0, focusMax: 4, focusCurrent: 4, investitureMax: 6, investitureCurrent: 6 },
    skills: {
      agilidad: { name: "AGILIDAD", attr: "vel", rank: 0 },
      armamento_ligero: { name: "ARMAMENTO LIGERO", attr: "vel", rank: 0 },
      armamento_pesado: { name: "ARMAMENTO PESADO", attr: "fue", rank: 0 },
      atletismo: { name: "ATLETISMO", attr: "vel", rank: 0 },
      hurto: { name: "HURTO", attr: "vel", rank: 0 },
      sigilo: { name: "SIGILO", attr: "vel", rank: 0 },
      custom_col1: { name: "", attr: "vel", rank: 0, custom: true },

      deduccion: { name: "DEDUCCIÓN", attr: "int", rank: 0 },
      disciplina: { name: "DISCIPLINA", attr: "vol", rank: 0 },
      intimidacion: { name: "INTIMIDACIÓN", attr: "vol", rank: 0 },
      manufactura: { name: "MANUFACTURA", attr: "int", rank: 0 },
      medicina: { name: "MEDICINA", attr: "int", rank: 0 },
      saber: { name: "SABER", attr: "int", rank: 0 },
      custom_col2: { name: "", attr: "int", rank: 0, custom: true },

      engano: { name: "ENGAÑO", attr: "pre", rank: 0 },
      liderazgo: { name: "LIDERAZGO", attr: "pre", rank: 0 },
      percepcion: { name: "PERCEPCIÓN", attr: "dis", rank: 0 },
      perspicacia: { name: "PERSPICACIA", attr: "dis", rank: 0 },
      persuasion: { name: "PERSUASIÓN", attr: "pre", rank: 0 },
      supervivencia: { name: "SUPERVIVENCIA", attr: "dis", rank: 0 },
      custom_col3: { name: "", attr: "pre", rank: 0, custom: true }
    },
    extraSkills: [],
    derived: { senses: "Normal (15 m)" },
    statuses: []
  };
}