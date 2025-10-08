document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar');
  const toggleButton = document.getElementById('sidebarToggle');

  if (!sidebar || !toggleButton) {
    return;
  }

  const isMobile = () => window.innerWidth <= 768;
  
  const applyPersistedState = () => {
    if (!isMobile()) {
      const shouldCollapse = localStorage.getItem('sidebarCollapsed') === 'true';
      sidebar.classList.toggle('collapsed', shouldCollapse);
    }
  };

  const handleToggle = () => {
    if (isMobile()) {
      // Mobile: toggle open/closed state
      sidebar.classList.toggle('open');
    } else {
      // Desktop: toggle collapsed/expanded state
      const isCollapsed = sidebar.classList.toggle('collapsed');
      localStorage.setItem('sidebarCollapsed', String(isCollapsed));
    }
  };

  // Close sidebar when clicking outside on mobile
  const handleOutsideClick = (e) => {
    if (isMobile() && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && !toggleButton.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    }
  };

  // Handle window resize
  const handleResize = () => {
    if (isMobile()) {
      sidebar.classList.remove('collapsed');
      sidebar.classList.remove('open');
    } else {
      sidebar.classList.remove('open');
      applyPersistedState();
    }
  };

  // Initialize
  applyPersistedState();
  
  // Event listeners
  toggleButton.addEventListener('click', handleToggle);
  document.addEventListener('click', handleOutsideClick);
  window.addEventListener('resize', handleResize);
});


