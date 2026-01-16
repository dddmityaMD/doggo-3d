import './style.css'
import { Game } from './game/Game'

function renderAppShell() {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) throw new Error('Missing #app')

  app.innerHTML = `
    <canvas id="game" tabindex="0"></canvas>
    <div id="hud">
      <div class="hud-row">
        <div class="hud-help">
          <div><b>WASD / Стрелки</b> — бег</div>
          <div><b>Shift</b> — ходьба</div>
          <div><b>Пробел</b> — прыжок</div>
          <div><b>Мышь</b> — смотреть (кликни по сцене)</div>
        </div>
        <div id="hunger" class="hud-hunger" title="Голод">
          <span class="hud-hunger-icon">🍓</span>
          <span id="hunger-value">100%</span>
        </div>
      </div>
    </div>
    <div id="notice" class="hidden"></div>
    <div id="confirm" class="hidden">
      <div class="confirm-title">Продолжить?</div>
      <div class="confirm-actions">
        <button id="confirm-yes">Да</button>
        <button id="confirm-no">Нет</button>
      </div>
    </div>
    <div id="status">Загрузка…</div>
  `

  return {
    root: app,
    canvas: app.querySelector<HTMLCanvasElement>('#game')!,
    status: app.querySelector<HTMLDivElement>('#status')!,
    notice: app.querySelector<HTMLDivElement>('#notice')!,
    confirm: app.querySelector<HTMLDivElement>('#confirm')!,
    confirmYes: app.querySelector<HTMLButtonElement>('#confirm-yes')!,
    confirmNo: app.querySelector<HTMLButtonElement>('#confirm-no')!,
    hungerValue: app.querySelector<HTMLSpanElement>('#hunger-value')!,
  }
}

async function main() {
  const { root, canvas, status, notice, confirm, confirmYes, confirmNo, hungerValue } = renderAppShell()

  const game = new Game({
    root,
    canvas,
    statusEl: status,
    noticeEl: notice,
    confirmEl: confirm,
    confirmYes,
    confirmNo,
    hungerEl: hungerValue,
  })
  await game.init()
  game.start()
}

void main()
