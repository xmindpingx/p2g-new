// places2go — Alert helper (web)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Same signature as Alert.alert, implemented with window.alert / window.confirm
// / window.prompt so that confirmations and error messages work in a browser.
//
//   no buttons or one button  → window.alert, then that button's onPress
//   two buttons               → window.confirm: OK runs the non-cancel button,
//                               Cancel runs the button with style 'cancel'
//   three or more buttons     → window.prompt listing the choices by number
const text = (title, message) => [title, message].filter((s) => s != null && String(s).trim() !== '').join('\n\n');

const run = (button) => { if (button && typeof button.onPress === 'function') button.onPress(); };

export function showAlert(title, message, buttons = [], _options) {
  const list = Array.isArray(buttons) ? buttons.filter(Boolean) : [];

  if (list.length <= 1) {
    window.alert(text(title, message));
    run(list[0]);
    return;
  }

  const cancel = list.find((b) => b.style === 'cancel');

  if (list.length === 2) {
    const action = list.find((b) => b !== cancel) || list[1];
    const ok = window.confirm(`${text(title, message)}\n\n[OK] ${action.text || 'OK'}    [Cancel] ${(cancel && cancel.text) || 'Cancel'}`);
    run(ok ? action : cancel);
    return;
  }

  const choices = list.filter((b) => b !== cancel);
  const menu = choices.map((b, i) => `${i + 1}. ${b.text || `Option ${i + 1}`}`).join('\n');
  const answer = window.prompt(`${text(title, message)}\n\n${menu}\n\nEnter a number (Cancel to dismiss):`, '1');
  if (answer === null) { run(cancel); return; }
  const index = parseInt(answer, 10) - 1;
  if (Number.isInteger(index) && index >= 0 && index < choices.length) run(choices[index]);
  else run(cancel);
}
