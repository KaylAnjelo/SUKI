document.addEventListener('DOMContentLoaded', () => {
    const logoutForm = document.getElementById('logoutForm');
    if (logoutForm) {
      logoutForm.addEventListener('submit', function (e) {
        const confirmed = confirm("Are you sure you want to log out?");
        if (!confirmed) {
          e.preventDefault();
        }
      });
    }
  });
  