// Magnetic physics for dock buttons
export function initDock(root: HTMLElement): void {
  const buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-magnetic]'));
  const strength = 9; // px of pull at the edge of the button

  for (const button of buttons) {
    let frame = 0;

    const apply = (x: number, y: number) => {
      const rect = button.getBoundingClientRect();
      const dx = x - (rect.left + rect.width / 2);
      const dy = y - (rect.top + rect.height / 2);
      const half = rect.width / 2;
      const nx = Math.max(-1, Math.min(1, dx / half));
      const ny = Math.max(-1, Math.min(1, dy / half));
      button.style.setProperty('--mx', `${(nx * strength).toFixed(2)}px`);
      button.style.setProperty('--my', `${(ny * strength).toFixed(2)}px`);
    };

    button.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply(event.clientX, event.clientY);
      });
    });

    button.addEventListener('pointerleave', () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      button.style.setProperty('--mx', '0px');
      button.style.setProperty('--my', '0px');
    });

    button.addEventListener('focus', () => {
      button.style.setProperty('--my', '-3px');
    });

    button.addEventListener('blur', () => {
      button.style.setProperty('--my', '0px');
    });
  }
}
