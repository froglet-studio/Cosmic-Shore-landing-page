// Video thumbnail click-to-play
document.querySelectorAll('.vessel-video').forEach(el => {
  el.addEventListener('click', () => {
    const id = el.dataset.videoId;
    if (!id) return;
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube.com/embed/' + id + '?autoplay=1';
    iframe.title = 'Cosmic Shore Trailer';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    el.innerHTML = '';
    el.appendChild(iframe);
  });
});

// Scroll reveal animation
const reveals = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });
reveals.forEach(el => observer.observe(el));
