# 6 Nimmt! - Jogo Multiplayer Online

Um jogo de cartas multiplayer online baseado no clássico jogo de tabuleiro "6 Nimmt!" (também conhecido como "Pega 6" ou "Take 5"). Construído com React, TypeScript, Vite e WebSocket para comunicação em tempo real.

## 🎮 Sobre o Jogo

6 Nimmt! é um jogo de cartas estratégico onde os jogadores tentam evitar pegar cartas com "touros" (pontos de penalidade). O jogo suporta de 2 a 10 jogadores, incluindo bots para jogar sozinho ou com amigos.

### Regras Básicas

- Cada jogador recebe 10 cartas no início de cada rodada
- Existem 4 fileiras na mesa, cada uma começando com uma carta
- Todos os jogadores escolhem uma carta simultaneamente
- As cartas são reveladas e colocadas nas fileiras em ordem crescente
- Se uma fileira atingir 6 cartas, o jogador que colocou a 6ª carta pega as 5 primeiras (e seus touros)
- O jogo termina quando um jogador atinge 66 pontos de penalidade
- Vence quem tiver MENOS pontos ao final

## 🚀 Tecnologias

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Node.js + WebSocket (ws)
- **Estilização**: TailwindCSS (via CDN)
- **Deploy**: Render.com

## 📦 Instalação Local

### Pré-requisitos

- Node.js 18+ instalado

### Passos

1. Clone o repositório:
```bash
git clone https://github.com/alvarovotan/peguin6-game.git
cd peguin6-game
```

2. Instale as dependências:
```bash
npm install
```

3. Faça o build da aplicação:
```bash
npm run build
```

4. Inicie o servidor:
```bash
npm start
```

5. Acesse no navegador:
```
http://localhost:3000
```

## 🎯 Como Jogar Online

1. **Criar Sala**: Clique em "Criar Sala" e compartilhe o código da sala com seus amigos
2. **Entrar em Sala**: Digite o código da sala que você recebeu e clique em "Entrar"
3. **Adicionar Bots**: O host da sala pode adicionar bots para completar a partida
4. **Iniciar Jogo**: Quando todos estiverem prontos, o host inicia o jogo
5. **Jogar**: Escolha uma carta da sua mão a cada turno e tente minimizar seus pontos

## 🔧 Desenvolvimento

### Estrutura do Projeto

```
peguin6-game/
├── src/
│   ├── components/
│   │   ├── Card.tsx          # Componente de carta
│   │   ├── ScoreBoard.tsx    # Placar de pontuação
│   │   └── TableRow.tsx      # Fileira da mesa
│   ├── App.tsx               # Componente principal
│   ├── index.tsx             # Ponto de entrada React
│   ├── types.ts              # Tipos TypeScript
│   └── constants.ts          # Constantes e lógica do baralho
├── server.cjs                # Servidor WebSocket
├── index.html                # HTML principal
├── vite.config.ts            # Configuração Vite
├── tsconfig.json             # Configuração TypeScript
└── package.json              # Dependências
```

### Scripts Disponíveis

- `npm run dev` - Inicia o servidor de desenvolvimento Vite
- `npm run build` - Faz o build de produção
- `npm run preview` - Preview do build de produção
- `npm start` - Inicia o servidor Node.js

## 🌐 Deploy no Render.com

O projeto está configurado para deploy automático no Render.com:

1. O Render detecta mudanças no branch `master`
2. Executa `npm install` para instalar dependências
3. Executa `npm run build` para criar o build de produção
4. Inicia o servidor com `npm start`

### Configuração no Render

- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Environment**: Node

## 🎨 Recursos

- ✅ Interface minimalista e responsiva
- ✅ Suporte para 2-10 jogadores
- ✅ Bots com IA básica
- ✅ Sistema de salas com códigos únicos
- ✅ Comunicação em tempo real via WebSocket
- ✅ Efeitos sonoros programáticos
- ✅ Animações suaves
- ✅ Modo silencioso

## 📝 Licença

Este projeto é de código aberto e está disponível para uso pessoal e educacional.

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.

---

Desenvolvido com ❤️ usando React e TypeScript
