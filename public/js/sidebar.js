document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar');
  const toggleButton = document.getElementById('sidebarToggle');

  if (!sidebar || !toggleButton) {
    return;
  }

  const applyPersistedState = () => {
    const shouldCollapse = localStorage.getItem('sidebarCollapsed') === 'true';
    sidebar.classList.toggle('collapsed', shouldCollapse);
  };

  applyPersistedState();

  toggleButton.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', String(isCollapsed));
  });
});


