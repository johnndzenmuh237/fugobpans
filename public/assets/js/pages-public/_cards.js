import { escapeHtml, formatCurrency, formatDate, statusBadge, pctBar, KIND_ICON, KIND_LABEL, PURPOSE_LABEL } from '../utils.js';

export function listingCard(p) {
  const bg = p.photo_url ? `style="background-image:url('${escapeHtml(p.photo_url)}')"` : '';
  const uncompleted = p.construction_status === 'UNCOMPLETED';
  const price = p.asking_price ? formatCurrency(p.asking_price) : (p.rent_from ? `From ${formatCurrency(p.rent_from)} / month` : '');
  return `<article class="prop-card"><a href="/property.html?id=${p.id}" style="color:inherit;text-decoration:none">
    <div class="prop-media k-${p.kind}" ${bg}>${p.photo_url ? '' : KIND_ICON[p.kind]}<div class="tags">${statusBadge(p.construction_status)}<span class="badge badge-info">${PURPOSE_LABEL[p.purpose]}</span></div></div>
    <div class="prop-body"><div class="text-muted" style="font-size:.74rem;text-transform:uppercase;letter-spacing:.06em">${KIND_LABEL[p.kind]}${p.category_name ? ` · ${escapeHtml(p.category_name)}` : ''}</div>
      <h3>${escapeHtml(p.name)}</h3><div class="prop-meta"><span>📍 ${escapeHtml([p.location, p.city].filter(Boolean).join(', ') || 'Location on request')}</span>${p.size_sqm ? `<span>${Number(p.size_sqm).toLocaleString()} m²</span>` : ''}${p.vacant_units ? `<span>${p.vacant_units} vacant</span>` : ''}</div>
      ${price ? `<div class="prop-price">${price}</div>` : ''}
      ${uncompleted ? `<div class="prop-meta"><span>${p.completion_percent}% built${p.expected_completion_date ? ` · ready ${formatDate(p.expected_completion_date)}` : ''}</span></div>${pctBar(p.completion_percent)}` : ''}</div></a></article>`;
}
