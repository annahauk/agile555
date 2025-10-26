export function mountAffirmations() {
  const container = document.querySelector('.card.placeholder') as HTMLElement;
  if (!container) return;

  const affirmations = [
    "You are capable of achieving great things.",
    "Each step forward is progress.",
    "Your hard work is paying off.",
    "You deserve rest and kindness.",
    "You are learning and growing every day."
  ];

  const randomAffirmation = affirmations[Math.floor(Math.random() * affirmations.length)];

  container.innerHTML = `
    <h2>Daily Affirmation 🌞</h2>
    <p>${randomAffirmation}</p>
    <button id="new-affirmation">Refresh Affirmation</button>
  `;

  const newBtn = document.getElementById('new-affirmation')!;
  newBtn.addEventListener('click', () => {
    const another = affirmations[Math.floor(Math.random() * affirmations.length)];
    container.querySelector('p')!.textContent = another;
  });
}