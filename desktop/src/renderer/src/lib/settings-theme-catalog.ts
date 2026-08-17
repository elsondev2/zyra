import {
    DARK_THEME_IDS,
    LIGHT_THEME_IDS,
    getThemeAppearance,
    isDarkThemeId,
    isLightThemeId,
    isThemeId,
    type DarkThemeId,
    type LightThemeId,
    type ThemeAppearance,
    type ThemeId
} from '@shared/preferences/theme-contract'

export interface ThemeTokens {
    bg: string
    text: string
    textDark: string
    textDarker: string
    textSecondary: string
    textMuted: string
    card: string
    border: string
    borderSecondary: string
    primary: string
    secondary: string
    accent: string
}

export interface ThemeDefinition {
    id: string
    name: string
    color: string
    description: string
    accentColor: string
    tokens: ThemeTokens
}

export const THEMES = [
    {
        id: 'dark',
        name: 'Dark',
        color: '#0c121f',
        description: 'Classic dark theme',
        accentColor: 'Blue',
        tokens: {
            bg: '#0c121f',
            text: '#f0f4f8',
            textDark: '#d3dbe4',
            textDarker: '#aab4c3',
            textSecondary: '#7e92a9',
            textMuted: '#3b4658',
            card: '#131c2c',
            border: '#1f2a3d',
            borderSecondary: '#212f44',
            primary: '#4f90e6',
            secondary: '#3db58a',
            accent: '#243144'
        }
    },
    {
        id: 'midnight',
        name: 'Midnight',
        color: '#0a0e1a',
        description: 'Deep blue darkness',
        accentColor: 'Indigo',
        tokens: {
            bg: '#0a0e1a',
            text: '#d4dff7',
            textDark: '#b8c9f0',
            textDarker: '#9bb0e3',
            textSecondary: '#7a92d6',
            textMuted: '#2d3548',
            card: '#0f1420',
            border: '#1a2235',
            borderSecondary: '#1e2740',
            primary: '#5b8def',
            secondary: '#4a7dd9',
            accent: '#1a2438'
        }
    },
    {
        id: 'purple',
        name: 'Purple Haze',
        color: '#151122',
        description: 'Purple-tinted darkness',
        accentColor: 'Purple',
        tokens: {
            bg: '#151122',
            text: '#dac9f5',
            textDark: '#c6aef5',
            textDarker: '#b091e6',
            textSecondary: '#a48adf',
            textMuted: '#3c305a',
            card: '#1e1830',
            border: '#301a54',
            borderSecondary: '#341d5a',
            primary: '#7c32cc',
            secondary: '#6a1cb4',
            accent: '#341a4c'
        }
    },
    {
        id: 'green',
        name: 'Greenroom',
        color: '#08140f',
        description: 'Low-light emerald terminal',
        accentColor: 'Lime',
        tokens: {
            bg: '#08140f',
            text: '#d8efe1',
            textDark: '#bddfc8',
            textDarker: '#94bea4',
            textSecondary: '#63b987',
            textMuted: '#294538',
            card: '#0f1f18',
            border: '#193127',
            borderSecondary: '#1e3a2f',
            primary: '#5ac878',
            secondary: '#3fa262',
            accent: '#163126'
        }
    },
    {
        id: 'ocean',
        name: 'Ocean Deep',
        color: '#0a1520',
        description: 'Deep ocean blue',
        accentColor: 'Cyan',
        tokens: {
            bg: '#0a1520',
            text: '#c8e6f5',
            textDark: '#a3d5ed',
            textDarker: '#7ec4e5',
            textSecondary: '#5ab3dd',
            textMuted: '#2d4a5a',
            card: '#0f1d2a',
            border: '#1a2f3f',
            borderSecondary: '#1e3545',
            primary: '#3ba5d9',
            secondary: '#2891c7',
            accent: '#1a3040'
        }
    },
    {
        id: 'forest',
        name: 'Forest Night',
        color: '#0a1a11',
        description: 'Dark forest green',
        accentColor: 'Emerald',
        tokens: {
            bg: '#0a1a11',
            text: '#cceccc',
            textDark: '#9fd9a3',
            textDarker: '#76b981',
            textSecondary: '#4fd19c',
            textMuted: '#365542',
            card: '#122c1d',
            border: '#1a3f28',
            borderSecondary: '#153422',
            primary: '#1ebd87',
            secondary: '#047857',
            accent: '#254335'
        }
    },
    {
        id: 'slate',
        name: 'Slate',
        color: '#1a1d23',
        description: 'Cool gray slate',
        accentColor: 'Sky',
        tokens: {
            bg: '#1a1d23',
            text: '#e2e8f0',
            textDark: '#cbd5e1',
            textDarker: '#94a3b8',
            textSecondary: '#64748b',
            textMuted: '#3d4451',
            card: '#22252c',
            border: '#2d3139',
            borderSecondary: '#353942',
            primary: '#60a5fa',
            secondary: '#3b82f6',
            accent: '#2a2e36'
        }
    },
    {
        id: 'charcoal',
        name: 'Charcoal',
        color: '#16181d',
        description: 'Warm charcoal gray',
        accentColor: 'Amber',
        tokens: {
            bg: '#16181d',
            text: '#e8e6e3',
            textDark: '#d1cfc9',
            textDarker: '#b8b5ad',
            textSecondary: '#9a9790',
            textMuted: '#3a3c40',
            card: '#1e2025',
            border: '#292b30',
            borderSecondary: '#31333a',
            primary: '#f59e0b',
            secondary: '#d97706',
            accent: '#26282d'
        }
    },
    {
        id: 'navy',
        name: 'Cursor Dark',
        color: '#0b0d10',
        description: 'Near-black cursor-inspired theme',
        accentColor: 'Blue',
        tokens: {
            bg: '#0b0d10',
            text: '#eef2f7',
            textDark: '#d3d9e2',
            textDarker: '#afb8c4',
            textSecondary: '#838d9b',
            textMuted: '#343a45',
            card: '#12161c',
            border: '#1b212a',
            borderSecondary: '#232a35',
            primary: '#5c96e6',
            secondary: '#4a83d4',
            accent: '#171b22'
        }
    },
    {
        id: 'codex',
        name: 'Codex',
        color: '#111111',
        description: 'Upstream Codex dark with neutral black surfaces',
        accentColor: 'Sky',
        tokens: {
            bg: '#111111',
            text: '#fcfcfc',
            textDark: '#dbdbdb',
            textDarker: '#acacac',
            textSecondary: '#0169cc',
            textMuted: '#4e4e4e',
            card: '#1e1e1e',
            border: '#333333',
            borderSecondary: '#414141',
            primary: '#0169cc',
            secondary: '#b06dff',
            accent: '#232323'
        }
    },
    {
        id: 'dp-code',
        name: 'DP Code',
        color: '#0e0e0e',
        description: 'DP Code upstream graphite with higher contrast',
        accentColor: 'Indigo',
        tokens: {
            bg: '#0e0e0e',
            text: '#f5f5f5',
            textDark: '#d5d5d5',
            textDarker: '#a6a6a6',
            textSecondary: '#6073cc',
            textMuted: '#4a4a4a',
            card: '#1b1b1b',
            border: '#2f2f2f',
            borderSecondary: '#3d3d3d',
            primary: '#6073cc',
            secondary: '#ad7bf9',
            accent: '#1f1f1f'
        }
    },
    {
        id: 'linear',
        name: 'Linear',
        color: '#0f0f11',
        description: 'Linear-inspired matte black with indigo focus',
        accentColor: 'Indigo',
        tokens: {
            bg: '#0f0f11',
            text: '#e3e4e6',
            textDark: '#c5c6c8',
            textDarker: '#9b9c9e',
            textSecondary: '#606acc',
            textMuted: '#464648',
            card: '#1b1b1d',
            border: '#2e2e30',
            borderSecondary: '#3a3b3d',
            primary: '#606acc',
            secondary: '#c2a1ff',
            accent: '#1f1f21'
        }
    },
    {
        id: 'vercel',
        name: 'Vercel',
        color: '#000000',
        description: 'Vercel black-and-white shell with blue focus',
        accentColor: 'Sky',
        tokens: {
            bg: '#000000',
            text: '#ededed',
            textDark: '#cccccc',
            textDarker: '#9c9c9c',
            textSecondary: '#006efe',
            textMuted: '#3e3e3e',
            card: '#0d0d0d',
            border: '#222222',
            borderSecondary: '#313131',
            primary: '#006efe',
            secondary: '#9540d5',
            accent: '#121212'
        }
    },
    {
        id: 'notion',
        name: 'Notion',
        color: '#191919',
        description: 'Notion-style low-chrome charcoal workspace',
        accentColor: 'Blue',
        tokens: {
            bg: '#191919',
            text: '#d9d9d8',
            textDark: '#bebebd',
            textDarker: '#989897',
            textSecondary: '#3183d8',
            textMuted: '#4b4b4b',
            card: '#242424',
            border: '#353535',
            borderSecondary: '#404040',
            primary: '#3183d8',
            secondary: '#4ec9b0',
            accent: '#272727'
        }
    },
    {
        id: 'raycast',
        name: 'Raycast',
        color: '#101010',
        description: 'Raycast red accent over crisp black surfaces',
        accentColor: 'Rose',
        tokens: {
            bg: '#101010',
            text: '#fefefe',
            textDark: '#dddddd',
            textDarker: '#adadad',
            textSecondary: '#ff6363',
            textMuted: '#4e4e4e',
            card: '#1d1d1d',
            border: '#333333',
            borderSecondary: '#414141',
            primary: '#ff6363',
            secondary: '#cf2f98',
            accent: '#222222'
        }
    },
    {
        id: 'solarized',
        name: 'Solarized Dark',
        color: '#002b36',
        description: 'Solarized blue-green base with warm red focus',
        accentColor: 'Red',
        tokens: {
            bg: '#002b36',
            text: '#839496',
            textDark: '#718589',
            textDarker: '#567075',
            textSecondary: '#d30102',
            textMuted: '#22464f',
            card: '#07313b',
            border: '#133a44',
            borderSecondary: '#1b414a',
            primary: '#d30102',
            secondary: '#d33682',
            accent: '#0a333d'
        }
    },
    {
        id: 'sentry',
        name: 'Sentry',
        color: '#2d2935',
        description: 'Sentry purple-brown surface with violet signals',
        accentColor: 'Indigo',
        tokens: {
            bg: '#2d2935',
            text: '#e6dff9',
            textDark: '#ccc6de',
            textDarker: '#a7a1b6',
            textSecondary: '#7055f6',
            textMuted: '#5d5868',
            card: '#373340',
            border: '#484351',
            borderSecondary: '#534e5d',
            primary: '#7055f6',
            secondary: '#8ee6d7',
            accent: '#3b3744'
        }
    },
    {
        id: 'matrix',
        name: 'Matrix',
        color: '#040805',
        description: 'Monospace green terminal palette',
        accentColor: 'Green',
        tokens: {
            bg: '#040805',
            text: '#b8ffca',
            textDark: '#9fdcae',
            textDarker: '#7bab87',
            textSecondary: '#1eff5a',
            textMuted: '#334838',
            card: '#0e1610',
            border: '#1e2c22',
            borderSecondary: '#293b2d',
            primary: '#1eff5a',
            secondary: '#1eff5a',
            accent: '#121b14'
        }
    },
    {
        id: 'temple',
        name: 'Temple',
        color: '#02120c',
        description: 'Deep green temple dark with acid-lime accent',
        accentColor: 'Yellow',
        tokens: {
            bg: '#02120c',
            text: '#c7e6da',
            textDark: '#abc8bd',
            textDarker: '#849e94',
            textSecondary: '#e4f222',
            textMuted: '#354942',
            card: '#0d1e17',
            border: '#1f312a',
            borderSecondary: '#2a3d36',
            primary: '#e4f222',
            secondary: '#40c977',
            accent: '#11221b'
        }
    },
    {
        id: 'oscurange',
        name: 'Oscurange',
        color: '#0b0b0f',
        description: 'Near-black orange accent with clean contrast',
        accentColor: 'Orange',
        tokens: {
            bg: '#0b0b0f',
            text: '#e6e6e6',
            textDark: '#c7c7c8',
            textDarker: '#9c9c9d',
            textSecondary: '#f9b98c',
            textMuted: '#444447',
            card: '#17171b',
            border: '#2b2b2e',
            borderSecondary: '#38383b',
            primary: '#f9b98c',
            secondary: '#479ffa',
            accent: '#1b1b1f'
        }
    },
    {
        id: 'lobster',
        name: 'Lobster',
        color: '#111827',
        description: 'Navy shell with coral red focus',
        accentColor: 'Rose',
        tokens: {
            bg: '#111827',
            text: '#e4e4e7',
            textDark: '#c6c7cc',
            textDarker: '#9c9fa6',
            textSecondary: '#ff5c5c',
            textMuted: '#484d59',
            card: '#1d2332',
            border: '#303643',
            borderSecondary: '#3c424e',
            primary: '#ff5c5c',
            secondary: '#3b82f6',
            accent: '#212735'
        }
    },
    {
        id: 'absolutely',
        name: 'Absolutely',
        color: '#2d2d2b',
        description: 'Warm graphite with copper accents',
        accentColor: 'Orange',
        tokens: {
            bg: '#2d2d2b',
            text: '#f9f9f7',
            textDark: '#dcdcda',
            textDarker: '#b4b4b2',
            textSecondary: '#cc7d5e',
            textMuted: '#626260',
            card: '#383836',
            border: '#4b4b49',
            borderSecondary: '#575755',
            primary: '#cc7d5e',
            secondary: '#00c853',
            accent: '#3c3c3a'
        }
    },
    {
        id: 'vscode-plus',
        name: 'VS Code Plus',
        color: '#1e1e1e',
        description: 'VS Code-style workbench dark',
        accentColor: 'Sky',
        tokens: {
            bg: '#1e1e1e',
            text: '#d4d4d4',
            textDark: '#bbbbbb',
            textDarker: '#969696',
            textSecondary: '#007acc',
            textMuted: '#4d4d4d',
            card: '#282828',
            border: '#383838',
            borderSecondary: '#434343',
            primary: '#007acc',
            secondary: '#000080',
            accent: '#2c2c2c'
        }
    },
    {
        id: 'material',
        name: 'Material',
        color: '#212121',
        description: 'Material dark with soft teal emphasis',
        accentColor: 'Teal',
        tokens: {
            bg: '#212121',
            text: '#eeffff',
            textDark: '#d1e0e0',
            textDarker: '#a8b4b4',
            textSecondary: '#80cbc4',
            textMuted: '#565b5b',
            card: '#2c2d2d',
            border: '#3f4141',
            borderSecondary: '#4b4f4f',
            primary: '#80cbc4',
            secondary: '#c792ea',
            accent: '#303232'
        }
    },
    {
        id: 'dracula',
        name: 'Dracula',
        color: '#282a36',
        description: 'Violet dusk with neon contrast',
        accentColor: 'Pink',
        tokens: {
            bg: '#282a36',
            text: '#f8f8f2',
            textDark: '#e4e3da',
            textDarker: '#c8c6bb',
            textSecondary: '#bd93f9',
            textMuted: '#5b5f74',
            card: '#303341',
            border: '#44475a',
            borderSecondary: '#4e5367',
            primary: '#ff79c6',
            secondary: '#8be9fd',
            accent: '#35384a'
        }
    },
    {
        id: 'nord',
        name: 'Nord',
        color: '#2e3440',
        description: 'Arctic blue-gray calm',
        accentColor: 'Sky',
        tokens: {
            bg: '#2e3440',
            text: '#eceff4',
            textDark: '#e5e9f0',
            textDarker: '#d8dee9',
            textSecondary: '#81a1c1',
            textMuted: '#4c566a',
            card: '#353c4a',
            border: '#434c5e',
            borderSecondary: '#4c566a',
            primary: '#88c0d0',
            secondary: '#8fbcbb',
            accent: '#3b4252'
        }
    },
    {
        id: 'gruvbox',
        name: 'Gruvbox Dark',
        color: '#282828',
        description: 'Retro warmth with muted earth tones',
        accentColor: 'Orange',
        tokens: {
            bg: '#282828',
            text: '#ebdbb2',
            textDark: '#d5c4a1',
            textDarker: '#bdae93',
            textSecondary: '#d79921',
            textMuted: '#665c54',
            card: '#32302f',
            border: '#504945',
            borderSecondary: '#5a524d',
            primary: '#fe8019',
            secondary: '#b8bb26',
            accent: '#3c3836'
        }
    },
    {
        id: 'one-dark',
        name: 'One Dark',
        color: '#282c34',
        description: 'Atom-era dark with balanced contrast',
        accentColor: 'Blue',
        tokens: {
            bg: '#282c34',
            text: '#abb2bf',
            textDark: '#c7ceda',
            textDarker: '#8e97a3',
            textSecondary: '#7f848e',
            textMuted: '#4b5263',
            card: '#2f3440',
            border: '#3a404d',
            borderSecondary: '#454c5d',
            primary: '#61afef',
            secondary: '#98c379',
            accent: '#313742'
        }
    },
    {
        id: 'github-dark',
        name: 'GitHub Dark',
        color: '#0d1117',
        description: 'Understated graphite with cool blue signals',
        accentColor: 'Blue',
        tokens: {
            bg: '#0d1117',
            text: '#e6edf3',
            textDark: '#c9d1d9',
            textDarker: '#8b949e',
            textSecondary: '#7d8590',
            textMuted: '#484f58',
            card: '#161b22',
            border: '#30363d',
            borderSecondary: '#3d444d',
            primary: '#58a6ff',
            secondary: '#2ea043',
            accent: '#1f2630'
        }
    },
    {
        id: 'tokyo-night',
        name: 'Tokyo Night',
        color: '#1a1b26',
        description: 'Downtown neon over indigo asphalt',
        accentColor: 'Indigo',
        tokens: {
            bg: '#1a1b26',
            text: '#c0caf5',
            textDark: '#a9b7e9',
            textDarker: '#7f8db8',
            textSecondary: '#7aa2f7',
            textMuted: '#414868',
            card: '#1f2335',
            border: '#2a3149',
            borderSecondary: '#343c5a',
            primary: '#7aa2f7',
            secondary: '#bb9af7',
            accent: '#24283b'
        }
    },
    {
        id: 'rose-pine',
        name: 'Rose Pine',
        color: '#191724',
        description: 'Soft mauve shadows and low-glare contrast',
        accentColor: 'Rose',
        tokens: {
            bg: '#191724',
            text: '#e0def4',
            textDark: '#cecaf0',
            textDarker: '#a9a3d5',
            textSecondary: '#908caa',
            textMuted: '#524f67',
            card: '#1f1d2e',
            border: '#312f44',
            borderSecondary: '#3a3750',
            primary: '#eb6f92',
            secondary: '#9ccfd8',
            accent: '#26233a'
        }
    },
    {
        id: 'rose-pine-moon',
        name: 'Rose Pine Moon',
        color: '#232136',
        description: 'Dusty plum with moonlit highlights',
        accentColor: 'Violet',
        tokens: {
            bg: '#232136',
            text: '#e0def4',
            textDark: '#d6d2ec',
            textDarker: '#b2accf',
            textSecondary: '#908caa',
            textMuted: '#5c5876',
            card: '#2a273f',
            border: '#393552',
            borderSecondary: '#443f61',
            primary: '#c4a7e7',
            secondary: '#ea9a97',
            accent: '#2f2b47'
        }
    },
    {
        id: 'catppuccin-frappe',
        name: 'Catppuccin Frappe',
        color: '#303446',
        description: 'Muted pastel dark with softer contrast',
        accentColor: 'Pink',
        tokens: {
            bg: '#303446',
            text: '#c6d0f5',
            textDark: '#b5bfe2',
            textDarker: '#99a1c0',
            textSecondary: '#8caaee',
            textMuted: '#626880',
            card: '#414559',
            border: '#51576d',
            borderSecondary: '#626880',
            primary: '#ca9ee6',
            secondary: '#81c8be',
            accent: '#3a3f55'
        }
    },
    {
        id: 'catppuccin-macchiato',
        name: 'Catppuccin Macchiato',
        color: '#24273a',
        description: 'Mac-like midnight with creamy accents',
        accentColor: 'Violet',
        tokens: {
            bg: '#24273a',
            text: '#cad3f5',
            textDark: '#b8c0e0',
            textDarker: '#939ab7',
            textSecondary: '#8aadf4',
            textMuted: '#5b6078',
            card: '#303347',
            border: '#494d64',
            borderSecondary: '#5b6078',
            primary: '#c6a0f6',
            secondary: '#8bd5ca',
            accent: '#363a4f'
        }
    },
    {
        id: 'catppuccin-mocha',
        name: 'Catppuccin Mocha',
        color: '#1e1e2e',
        description: 'Deepest Catppuccin variant with rich accents',
        accentColor: 'Violet',
        tokens: {
            bg: '#1e1e2e',
            text: '#cdd6f4',
            textDark: '#bac2de',
            textDarker: '#9399b2',
            textSecondary: '#89b4fa',
            textMuted: '#585b70',
            card: '#25263a',
            border: '#45475a',
            borderSecondary: '#585b70',
            primary: '#cba6f7',
            secondary: '#94e2d5',
            accent: '#313244'
        }
    },
    {
        id: 'ayu-dark',
        name: 'Ayu Dark',
        color: '#0f1419',
        description: 'Warm contrast over ink-black surfaces',
        accentColor: 'Orange',
        tokens: {
            bg: '#0f1419',
            text: '#e6e1cf',
            textDark: '#d9d4c1',
            textDarker: '#b8b49f',
            textSecondary: '#ffb454',
            textMuted: '#4c5663',
            card: '#171d24',
            border: '#25303b',
            borderSecondary: '#30404d',
            primary: '#ffb454',
            secondary: '#7fd962',
            accent: '#1d252e'
        }
    },
    {
        id: 'everforest',
        name: 'Everforest',
        color: '#232a2e',
        description: 'Comfortable woodland dark with soft greens',
        accentColor: 'Green',
        tokens: {
            bg: '#232a2e',
            text: '#d3c6aa',
            textDark: '#c5b89c',
            textDarker: '#a79a80',
            textSecondary: '#a7c080',
            textMuted: '#5c6a72',
            card: '#2d353b',
            border: '#475258',
            borderSecondary: '#56635f',
            primary: '#a7c080',
            secondary: '#7fbbb3',
            accent: '#343f44'
        }
    },
    {
        id: 'vesper',
        name: 'Vesper',
        color: '#101010',
        description: 'Minimal late-night gray with crisp cyan',
        accentColor: 'Teal',
        tokens: {
            bg: '#101010',
            text: '#f0f0f0',
            textDark: '#d8d8d8',
            textDarker: '#aaaaaa',
            textSecondary: '#99ffe4',
            textMuted: '#4f4f4f',
            card: '#171717',
            border: '#252525',
            borderSecondary: '#303030',
            primary: '#5de4c7',
            secondary: '#7aa2f7',
            accent: '#1f1f1f'
        }
    },
    {
        id: 'monokai',
        name: 'Monokai',
        color: '#272822',
        description: 'Classic high-energy dark with lime accents',
        accentColor: 'Lime',
        tokens: {
            bg: '#272822',
            text: '#f8f8f2',
            textDark: '#e6e6de',
            textDarker: '#bdbdb2',
            textSecondary: '#a6e22e',
            textMuted: '#75715e',
            card: '#2f3029',
            border: '#49483e',
            borderSecondary: '#59584f',
            primary: '#a6e22e',
            secondary: '#66d9ef',
            accent: '#3a3b33'
        }
    },
    {
        id: 'material-palenight',
        name: 'Material Palenight',
        color: '#292d3e',
        description: 'Lavender night with smooth material surfaces',
        accentColor: 'Indigo',
        tokens: {
            bg: '#292d3e',
            text: '#d0d0e2',
            textDark: '#c1c3d7',
            textDarker: '#959dcb',
            textSecondary: '#82aaff',
            textMuted: '#5f6b8a',
            card: '#303548',
            border: '#444267',
            borderSecondary: '#4e4a73',
            primary: '#82aaff',
            secondary: '#c792ea',
            accent: '#34324d'
        }
    },
    {
        id: 'material-ocean',
        name: 'Material Ocean',
        color: '#0f111a',
        description: 'Blue-leaning material dark with teal energy',
        accentColor: 'Cyan',
        tokens: {
            bg: '#0f111a',
            text: '#8f93a2',
            textDark: '#b8c0d8',
            textDarker: '#8695b7',
            textSecondary: '#84ffff',
            textMuted: '#465068',
            card: '#161b27',
            border: '#233045',
            borderSecondary: '#2c3952',
            primary: '#84ffff',
            secondary: '#89ddff',
            accent: '#1a2232'
        }
    },
    {
        id: 'night-owl',
        name: 'Night Owl',
        color: '#011627',
        description: 'Deep blue night built for long coding sessions',
        accentColor: 'Cyan',
        tokens: {
            bg: '#011627',
            text: '#d6deeb',
            textDark: '#c7d0df',
            textDarker: '#95a7c3',
            textSecondary: '#82aaff',
            textMuted: '#4b6479',
            card: '#0b2138',
            border: '#15314b',
            borderSecondary: '#1d3b58',
            primary: '#7fdbca',
            secondary: '#82aaff',
            accent: '#10233a'
        }
    },
    {
        id: 'moonlight',
        name: 'Moonlight',
        color: '#1e2030',
        description: 'Steel violet night with moonlit cyan',
        accentColor: 'Sky',
        tokens: {
            bg: '#1e2030',
            text: '#c8d3f5',
            textDark: '#b4bcd6',
            textDarker: '#8a93b5',
            textSecondary: '#82aaff',
            textMuted: '#5b6389',
            card: '#25283d',
            border: '#3a3f5b',
            borderSecondary: '#454b69',
            primary: '#82aaff',
            secondary: '#86e1fc',
            accent: '#2a2f45'
        }
    },
    {
        id: 'cobalt2',
        name: 'Cobalt2',
        color: '#193549',
        description: 'Electric blue dark with bright syntax punch',
        accentColor: 'Yellow',
        tokens: {
            bg: '#193549',
            text: '#ffffff',
            textDark: '#d7e5f0',
            textDarker: '#9fc0d4',
            textSecondary: '#ffc600',
            textMuted: '#5b7c8f',
            card: '#21445b',
            border: '#2d5873',
            borderSecondary: '#376580',
            primary: '#ffc600',
            secondary: '#5fd7ff',
            accent: '#264e66'
        }
    },
    {
        id: 'synthwave',
        name: 'Synthwave 84',
        color: '#241b2f',
        description: 'Retro neon purple with hot-pink glow',
        accentColor: 'Pink',
        tokens: {
            bg: '#241b2f',
            text: '#fdfdfd',
            textDark: '#f3eefe',
            textDarker: '#c7bde2',
            textSecondary: '#f92aad',
            textMuted: '#69517d',
            card: '#2d213a',
            border: '#443155',
            borderSecondary: '#523c66',
            primary: '#f92aad',
            secondary: '#36f9f6',
            accent: '#342645'
        }
    },
    {
        id: 'light',
        name: 'Zyra Light',
        color: '#f9fafb',
        description: 'Clean neutral light with crisp blue accents',
        accentColor: 'Blue',
        tokens: {
            bg: '#f9fafb',
            text: '#1e293b',
            textDark: '#334155',
            textDarker: '#475569',
            textSecondary: '#64748b',
            textMuted: '#94a3b8',
            card: '#ffffff',
            border: '#e2e8f0',
            borderSecondary: '#cbd5e1',
            primary: '#3b82f6',
            secondary: '#2dac7d',
            accent: '#f1f5f9'
        }
    },
    {
        id: 'paper-light',
        name: 'Paper',
        color: '#f7f3ea',
        description: 'Warm editorial paper with earthy accents',
        accentColor: 'Orange',
        tokens: {
            bg: '#f7f3ea',
            text: '#302d28',
            textDark: '#454038',
            textDarker: '#625b50',
            textSecondary: '#766d60',
            textMuted: '#a39989',
            card: '#fffdf8',
            border: '#ded7c8',
            borderSecondary: '#c9bfad',
            primary: '#9a5b31',
            secondary: '#4e7a68',
            accent: '#eee6d8'
        }
    },
    {
        id: 'notion-light',
        name: 'Notion Light',
        color: '#f7f7f5',
        description: 'Soft workspace neutrals with measured contrast',
        accentColor: 'Blue',
        tokens: {
            bg: '#f7f7f5',
            text: '#202020',
            textDark: '#373737',
            textDarker: '#555555',
            textSecondary: '#6b6b6b',
            textMuted: '#9b9a97',
            card: '#ffffff',
            border: '#e3e2df',
            borderSecondary: '#cecdc9',
            primary: '#2f7dd1',
            secondary: '#9065b0',
            accent: '#efefed'
        }
    },
    {
        id: 'github-light',
        name: 'GitHub Light',
        color: '#ffffff',
        description: 'Developer-focused gray canvas with GitHub blue',
        accentColor: 'Blue',
        tokens: {
            bg: '#ffffff',
            text: '#1f2328',
            textDark: '#30363d',
            textDarker: '#59636e',
            textSecondary: '#636c76',
            textMuted: '#8c959f',
            card: '#f6f8fa',
            border: '#d0d7de',
            borderSecondary: '#afb8c1',
            primary: '#0969da',
            secondary: '#1a7f37',
            accent: '#ddf4ff'
        }
    },
    {
        id: 'solarized-light',
        name: 'Solarized Light',
        color: '#fdf6e3',
        description: 'Low-glare cream with balanced cyan and blue',
        accentColor: 'Cyan',
        tokens: {
            bg: '#fdf6e3',
            text: '#073642',
            textDark: '#36545b',
            textDarker: '#586e75',
            textSecondary: '#657b83',
            textMuted: '#93a1a1',
            card: '#eee8d5',
            border: '#d8cfb4',
            borderSecondary: '#c2b99e',
            primary: '#268bd2',
            secondary: '#2aa198',
            accent: '#eee8d5'
        }
    },
    {
        id: 'rose-pine-dawn',
        name: 'Rosé Pine Dawn',
        color: '#faf4ed',
        description: 'Muted rose ivory with iris and pine accents',
        accentColor: 'Violet',
        tokens: {
            bg: '#faf4ed',
            text: '#575279',
            textDark: '#5f5a7d',
            textDarker: '#6e6a86',
            textSecondary: '#797593',
            textMuted: '#9893a5',
            card: '#fffaf3',
            border: '#dfdad9',
            borderSecondary: '#cec7c5',
            primary: '#907aa9',
            secondary: '#286983',
            accent: '#f2e9e1'
        }
    },
    {
        id: 'catppuccin-latte',
        name: 'Catppuccin Latte',
        color: '#eff1f5',
        description: 'Cool pastel light with lavender energy',
        accentColor: 'Violet',
        tokens: {
            bg: '#eff1f5',
            text: '#4c4f69',
            textDark: '#565a73',
            textDarker: '#6c6f85',
            textSecondary: '#7c7f93',
            textMuted: '#9ca0b0',
            card: '#e6e9ef',
            border: '#ccd0da',
            borderSecondary: '#bcc0cc',
            primary: '#8839ef',
            secondary: '#179299',
            accent: '#dce0e8'
        }
    },
    {
        id: 'everforest-light',
        name: 'Everforest Light',
        color: '#fdf6e3',
        description: 'Natural parchment with moss and jade accents',
        accentColor: 'Lime',
        tokens: {
            bg: '#fdf6e3',
            text: '#5c6a72',
            textDark: '#4f5e65',
            textDarker: '#697a80',
            textSecondary: '#7a8478',
            textMuted: '#9da9a0',
            card: '#f4f0d9',
            border: '#e0dcc7',
            borderSecondary: '#c9c5b2',
            primary: '#8da101',
            secondary: '#35a77c',
            accent: '#efebd4'
        }
    },
    {
        id: 'nord-snow',
        name: 'Nord Snow',
        color: '#eceff4',
        description: 'Arctic gray with calm frost-blue accents',
        accentColor: 'Sky',
        tokens: {
            bg: '#eceff4',
            text: '#2e3440',
            textDark: '#3b4252',
            textDarker: '#4c566a',
            textSecondary: '#5e6b7e',
            textMuted: '#8793a5',
            card: '#e5e9f0',
            border: '#d8dee9',
            borderSecondary: '#c5ccd8',
            primary: '#5e81ac',
            secondary: '#8fbcbb',
            accent: '#d8dee9'
        }
    },
    {
        id: 'tokyo-day',
        name: 'Tokyo Day',
        color: '#e6e7ed',
        description: 'Cool city daylight with saturated indigo',
        accentColor: 'Indigo',
        tokens: {
            bg: '#e6e7ed',
            text: '#343b59',
            textDark: '#3f4765',
            textDarker: '#565e78',
            textSecondary: '#707280',
            textMuted: '#9698a4',
            card: '#f3f3f6',
            border: '#c1c2c7',
            borderSecondary: '#aeb0b8',
            primary: '#2959aa',
            secondary: '#166775',
            accent: '#d6d8df'
        }
    },
    {
        id: 'vitesse-light',
        name: 'Vitesse Light',
        color: '#ffffff',
        description: 'Crisp white with understated forest green',
        accentColor: 'Emerald',
        tokens: {
            bg: '#ffffff',
            text: '#393a34',
            textDark: '#45463f',
            textDarker: '#5f6058',
            textSecondary: '#6d6e66',
            textMuted: '#9a9b94',
            card: '#f7f7f7',
            border: '#e7e7e7',
            borderSecondary: '#d2d2d2',
            primary: '#1c6b48',
            secondary: '#2f798a',
            accent: '#f1f1f1'
        }
    },
    {
        id: 'blossom-light',
        name: 'Blossom',
        color: '#fff7fa',
        description: 'Airy blossom pink with plum and violet accents',
        accentColor: 'Rose',
        tokens: {
            bg: '#fff7fa',
            text: '#4c2f3c',
            textDark: '#5e3d4b',
            textDarker: '#765564',
            textSecondary: '#896b78',
            textMuted: '#ad919d',
            card: '#ffffff',
            border: '#efdbe3',
            borderSecondary: '#ddc2cd',
            primary: '#c04478',
            secondary: '#7a6aa6',
            accent: '#f8e8ee'
        }
    },
    {
        id: 'ocean-mist',
        name: 'Ocean Mist',
        color: '#f2f8fb',
        description: 'Blue-white coastal surfaces with teal depth',
        accentColor: 'Cyan',
        tokens: {
            bg: '#f2f8fb',
            text: '#19394a',
            textDark: '#274b5c',
            textDarker: '#456777',
            textSecondary: '#5c7d8c',
            textMuted: '#8aa5b1',
            card: '#ffffff',
            border: '#d2e4ec',
            borderSecondary: '#b9d2dd',
            primary: '#197ca5',
            secondary: '#2f8f83',
            accent: '#e3f1f6'
        }
    },
    {
        id: 'lavender-light',
        name: 'Lavender',
        color: '#f8f7fc',
        description: 'Quiet lavender-gray with rich violet accents',
        accentColor: 'Violet',
        tokens: {
            bg: '#f8f7fc',
            text: '#343047',
            textDark: '#45405b',
            textDarker: '#5d5772',
            textSecondary: '#716b86',
            textMuted: '#9b95ad',
            card: '#ffffff',
            border: '#dfdbed',
            borderSecondary: '#c9c3dc',
            primary: '#6f5bd3',
            secondary: '#9c4f8c',
            accent: '#eeeafd'
        }
    },
    {
        id: 'gruvbox-light',
        name: 'Gruvbox Light',
        color: '#fbf1c7',
        description: 'Retro warm canvas with ochre and olive accents',
        accentColor: 'Amber',
        tokens: {
            bg: '#fbf1c7',
            text: '#3c3836',
            textDark: '#504945',
            textDarker: '#665c54',
            textSecondary: '#7c6f64',
            textMuted: '#a89984',
            card: '#f2e5bc',
            border: '#d5c4a1',
            borderSecondary: '#bdae93',
            primary: '#b57614',
            secondary: '#79740e',
            accent: '#ebdbb2'
        }
    },
    {
        id: 'atom-one-light',
        name: 'Atom One Light',
        color: '#fafafa',
        description: 'Crisp editor white with bright blue and green',
        accentColor: 'Blue',
        tokens: {
            bg: '#fafafa',
            text: '#282c34',
            textDark: '#3b4048',
            textDarker: '#505762',
            textSecondary: '#5c6370',
            textMuted: '#8b919e',
            card: '#ffffff',
            border: '#e2e4e8',
            borderSecondary: '#c9cdd4',
            primary: '#4078f2',
            secondary: '#50a14f',
            accent: '#f1f3f5'
        }
    },
    {
        id: 'bluloco-light',
        name: 'Bluloco Light',
        color: '#f5f7fb',
        description: 'Cool tinted canvas with vivid cobalt focus',
        accentColor: 'Indigo',
        tokens: {
            bg: '#f5f7fb',
            text: '#1f2937',
            textDark: '#334155',
            textDarker: '#475569',
            textSecondary: '#5b6472',
            textMuted: '#8792a2',
            card: '#ffffff',
            border: '#dce2ec',
            borderSecondary: '#bdc7d6',
            primary: '#275efe',
            secondary: '#008f8c',
            accent: '#e7efff'
        }
    },
    {
        id: 'brackets-light',
        name: 'Brackets Light',
        color: '#f8f8f8',
        description: 'Formal editor gray with restrained blue focus',
        accentColor: 'Sky',
        tokens: {
            bg: '#f8f8f8',
            text: '#2d2d2d',
            textDark: '#414141',
            textDarker: '#585858',
            textSecondary: '#6c6c6c',
            textMuted: '#969696',
            card: '#ffffff',
            border: '#dfdfdf',
            borderSecondary: '#c5c5c5',
            primary: '#007acc',
            secondary: '#2b8a3e',
            accent: '#e9f3f9'
        }
    },
    {
        id: 'quiet-light',
        name: 'Quiet Light',
        color: '#f5f5f5',
        description: 'Low-noise neutral gray with gentle violet',
        accentColor: 'Violet',
        tokens: {
            bg: '#f5f5f5',
            text: '#333333',
            textDark: '#444444',
            textDarker: '#5a5a5a',
            textSecondary: '#6b6b6b',
            textMuted: '#969696',
            card: '#ffffff',
            border: '#dedede',
            borderSecondary: '#c8c8c8',
            primary: '#705697',
            secondary: '#448c27',
            accent: '#ece8f2'
        }
    },
    {
        id: 'hop-light',
        name: 'Hop Light',
        color: '#fff9fc',
        description: 'Playful pastel shell with berry and lake accents',
        accentColor: 'Rose',
        tokens: {
            bg: '#fff9fc',
            text: '#342d38',
            textDark: '#4a3f4e',
            textDarker: '#62566a',
            textSecondary: '#776a7d',
            textMuted: '#a395a9',
            card: '#ffffff',
            border: '#eddde8',
            borderSecondary: '#d9c3d3',
            primary: '#c13a75',
            secondary: '#357aa5',
            accent: '#f9e9f1'
        }
    },
    {
        id: 'netbeans-light',
        name: 'NetBeans Light',
        color: '#f6f8fa',
        description: 'Robust white workspace with selective color',
        accentColor: 'Blue',
        tokens: {
            bg: '#f6f8fa',
            text: '#202124',
            textDark: '#34383d',
            textDarker: '#51565c',
            textSecondary: '#656b72',
            textMuted: '#92989f',
            card: '#ffffff',
            border: '#dce1e6',
            borderSecondary: '#c2c9d0',
            primary: '#1675d1',
            secondary: '#7a4eb0',
            accent: '#e7f1fb'
        }
    },
    {
        id: 'github-light-high-contrast',
        name: 'GitHub Light High Contrast',
        color: '#ffffff',
        description: 'Sharp white surfaces with reinforced boundaries',
        accentColor: 'Blue',
        tokens: {
            bg: '#ffffff',
            text: '#0d1117',
            textDark: '#24292f',
            textDarker: '#424a53',
            textSecondary: '#57606a',
            textMuted: '#6e7781',
            card: '#ffffff',
            border: '#8c959f',
            borderSecondary: '#57606a',
            primary: '#0550ae',
            secondary: '#116329',
            accent: '#ddf4ff'
        }
    },
    {
        id: 'ayu-light',
        name: 'Ayu Light',
        color: '#fafafa',
        description: 'Warm minimal white with amber and sky accents',
        accentColor: 'Orange',
        tokens: {
            bg: '#fafafa',
            text: '#4f555b',
            textDark: '#3d4248',
            textDarker: '#565b61',
            textSecondary: '#6f767e',
            textMuted: '#9299a1',
            card: '#ffffff',
            border: '#e7e8e9',
            borderSecondary: '#cfd2d5',
            primary: '#c25f16',
            secondary: '#2479a8',
            accent: '#fff1e3'
        }
    },
    {
        id: 'kanagawa-lotus',
        name: 'Kanagawa Lotus',
        color: '#f2ecdd',
        description: 'Japanese parchment with lotus and jade accents',
        accentColor: 'Rose',
        tokens: {
            bg: '#f2ecdd',
            text: '#4d4d5c',
            textDark: '#3f3f4a',
            textDarker: '#5d5a64',
            textSecondary: '#6c6972',
            textMuted: '#8e8a91',
            card: '#faf6e9',
            border: '#ded5c3',
            borderSecondary: '#c6baa6',
            primary: '#b53849',
            secondary: '#4f716b',
            accent: '#e7dfcf'
        }
    },
    {
        id: 'material-lighter',
        name: 'Material Lighter',
        color: '#fafafa',
        description: 'Clean material surfaces with indigo and teal',
        accentColor: 'Indigo',
        tokens: {
            bg: '#fafafa',
            text: '#263238',
            textDark: '#37474f',
            textDarker: '#546e7a',
            textSecondary: '#607d8b',
            textMuted: '#8799a3',
            card: '#ffffff',
            border: '#e0e0e0',
            borderSecondary: '#b0bec5',
            primary: '#3f51b5',
            secondary: '#00796b',
            accent: '#eceff1'
        }
    },
    {
        id: 'light-owl',
        name: 'Light Owl',
        color: '#fbfbfb',
        description: 'Soft white night-owl companion with cool blues',
        accentColor: 'Blue',
        tokens: {
            bg: '#fbfbfb',
            text: '#403f53',
            textDark: '#4f4d63',
            textDarker: '#625f77',
            textSecondary: '#726f86',
            textMuted: '#9895a8',
            card: '#ffffff',
            border: '#e3e1ea',
            borderSecondary: '#cbc8d6',
            primary: '#4876d6',
            secondary: '#0b7f84',
            accent: '#edf2ff'
        }
    },
    {
        id: 'alabaster-light',
        name: 'Alabaster',
        color: '#f7f7f7',
        description: 'Nearly monochrome canvas with deliberate blue',
        accentColor: 'Blue',
        tokens: {
            bg: '#f7f7f7',
            text: '#181818',
            textDark: '#2f2f2f',
            textDarker: '#494949',
            textSecondary: '#616161',
            textMuted: '#858585',
            card: '#ffffff',
            border: '#dedede',
            borderSecondary: '#bfbfbf',
            primary: '#325cc0',
            secondary: '#397b25',
            accent: '#ececec'
        }
    }
] as const satisfies readonly ThemeDefinition[]

export type Theme = ThemeId
export type LightTheme = LightThemeId
export type DarkTheme = DarkThemeId
export type { ThemeAppearance }
export {
    DARK_THEME_IDS,
    LIGHT_THEME_IDS,
    getThemeAppearance,
    isDarkThemeId,
    isLightThemeId,
    isThemeId
}

export const THEME_CLASS_IDS = THEMES
    .map((theme) => theme.id)
    .filter((themeId): themeId is Exclude<Theme, 'dark'> => themeId !== 'dark')

const THEME_LOOKUP = new Map<string, ThemeDefinition>(THEMES.map((theme) => [theme.id, theme]))

export const LIGHT_THEMES = THEMES.filter((theme): theme is (typeof THEMES)[number] & { id: LightTheme } => isLightThemeId(theme.id))
export const DARK_THEMES = THEMES.filter((theme): theme is (typeof THEMES)[number] & { id: DarkTheme } => isDarkThemeId(theme.id))

export function getThemeDefinition(themeId: Theme): ThemeDefinition {
    return THEME_LOOKUP.get(themeId) || THEMES[0]
}
