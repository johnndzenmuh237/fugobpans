const API = window.APP_CONFIG.API_BASE_URL;

async function main() {
  const root = document.getElementById('classesRoot');
  try {
    const [categories, classes, feeStructures] = await Promise.all([
      fetch(`${API}/academics/categories`).then((r) => r.json()),
      fetch(`${API}/academics/classes`).then((r) => r.json()),
      fetch(`${API}/academics/fee-structures`).then((r) => r.json()),
    ]);

    if (!categories.length) {
      root.innerHTML = '<div class="empty-state">Classes will be published here once configured by the school office.</div>';
      return;
    }

    const feeByClass = Object.fromEntries(feeStructures.map((f) => [f.class_id, f]));

    root.innerHTML = categories.map((cat) => {
      const inCat = classes.filter((c) => c.category_id === cat.id);
      return `
        <div style="margin-bottom:36px;">
          <h2>${cat.name}</h2>
          <div class="card-grid">
            ${inCat.map((c) => {
              const fee = feeByClass[c.id];
              return `
                <div class="feature-card">
                  <div class="icon-badge">🏫</div>
                  <h3>${c.name}</h3>
                  ${fee ? `
                    <p><strong>Registration Fee:</strong> ${Number(fee.registration_fee).toLocaleString()} FCFA</p>
                    <p><strong>School Fees:</strong> ${Number(fee.school_fee).toLocaleString()} FCFA</p>
                    <p><strong>Installment Available:</strong> ${fee.installment_allowed ? 'Yes' : 'No'}</p>
                  ` : `<p class="text-muted">Fees not yet published — contact the school office.</p>`}
                  <p class="text-muted">${c.student_count || 0} students registered</p>
                  <a class="btn btn-primary btn-block" href="/register.html?classId=${c.id}">Register Now</a>
                </div>`;
            }).join('') || '<p class="text-muted">Classes coming soon.</p>'}
          </div>
        </div>`;
    }).join('');
  } catch {
    root.innerHTML = '<div class="empty-state">Could not load classes right now — please try again shortly.</div>';
  }
}
main();
