import './style.css'
import { Game } from './game/Game'

function renderAppShell() {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) throw new Error('Missing #app')

  app.innerHTML = `
    <canvas id="game" tabindex="0"></canvas>
    <div id="hud">
      <div><b>WASD / Стрелки</b> — бег</div>
      <div><b>Пробел</b> — прыжок</div>
      <div><b>Мышь</b> — смотреть (кликни по сцене)</div>
    </div>
    <div id="status">Загрузка…</div>
  `

  return {
    canvas: app.querySelector<HTMLCanvasElement>('#game')!,
    status: app.querySelector<HTMLDivElement>('#status')!,
  }
}

async function main() {
  const { canvas, status } = renderAppShell()

  const game = new Game({ canvas, statusEl: status })
  await game.init()
  game.start()
}

void main()
