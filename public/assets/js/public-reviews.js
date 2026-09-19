const API = window.APP_CONFIG.API_BASE_URL;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

async function loadReviews() {
  const summaryMount = document.getElementById('summaryMount');
  const reviewsMount = document.getElementById('reviewsMount');
  try {
    const { reviews, total, average } = await fetch(`${API}/reviews`).then((r) => r.json());

    summaryMount.innerHTML = total > 0
      ? `<div style="font-size:2.2rem;color:var(--amber-500);">${stars(Math.round(average))}</div>
         <p style="margin:6px 0 0;"><strong>${average.toFixed(1)} / 5</strong> from ${total} approved review${total === 1 ? '' : 's'}</p>`
      : `<p class="text-muted">Be the first to leave a review.</p>`;

    reviewsMount.innerHTML = reviews.length ? `<div class="card-grid">${reviews.map((r) => `
      <div class="feature-card">
        ${r.featured ? '<span class="badge badge-info" style="margin-bottom:10px;">Featured</span>' : ''}
        <div style="color:var(--amber-500);font-size:1.1rem;">${stars(r.rating)}</div>
        <p>"${escapeHtml(r.comment)}"</p>
        <p class="text-muted" style="font-weight:700;">— ${escapeHtml(r.name)}</p>
      </div>`).join('')}</div>` : '';
  } catch {
    summaryMount.innerHTML = '<p class="text-muted">Could not load reviews right now.</p>';
  }
}

document.getElementById('reviewForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitReviewBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  const fd = new FormData(e.target);
  const body = { name: fd.get('name'), email: fd.get('email'), rating: fd.get('rating'), comment: fd.get('comment'), honeypot: fd.get('website') };

  try {
    const res = await fetch(`${API}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not submit your review.');

    const successEl = document.getElementById('reviewSuccess');
    successEl.textContent = data.message;
    successEl.classList.remove('hidden');
    e.target.reset();
    e.target.classList.add('hidden');
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
    btn.textContent = 'Submit Review';
  }
});

loadReviews();
