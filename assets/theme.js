(() => {
  const KEY = 'gongkao.theme.v1';
  const SUN_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/></svg>';
  const MOON_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 14.4A8.2 8.2 0 0 1 9.6 3.8a8.2 8.2 0 1 0 10.6 10.6z"/></svg>';
  const systemTheme = () =>
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const storedTheme = () => {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  };
  const applyTheme = (mode, persist) => {
    const next = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    if (persist) {
      try {
        localStorage.setItem(KEY, next);
      } catch {}
    }
    const label = next === 'dark' ? '切换为白玉浅色模式' : '切换为玄墨深色模式';
    const icon = next === 'dark' ? SUN_ICON : MOON_ICON;
    for (const btn of document.querySelectorAll('[data-theme-toggle]')) {
      btn.setAttribute('aria-pressed', String(next === 'dark'));
      btn.setAttribute('aria-label', label);
      btn.title = label;
      btn.innerHTML = icon;
    }
  };

  const initial = document.documentElement.dataset.theme === 'dark'
    ? 'dark'
    : (storedTheme() || systemTheme());
  applyTheme(initial, false);

  for (const btn of document.querySelectorAll('[data-theme-toggle]')) {
    btn.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark', true);
    });
  }

  window.addEventListener('storage', e => {
    if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
      applyTheme(e.newValue, false);
    }
  });

  if (window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => {
      if (!storedTheme()) applyTheme(e.matches ? 'dark' : 'light', false);
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else if (media.addListener) media.addListener(onChange);
  }
})();
