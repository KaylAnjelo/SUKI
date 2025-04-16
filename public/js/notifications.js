document.addEventListener("DOMContentLoaded", () => {
    const notifBtn = document.getElementById('notifButton');
    const notifDropdown = document.getElementById('notifDropdown');
  
    if (notifBtn && notifDropdown) {
      notifBtn.addEventListener('click', async () => {
        notifDropdown.classList.toggle('hidden');
  
        if (!notifDropdown.classList.contains('loaded')) {
          try {
            const res = await fetch('/notifications');
            const data = await res.json();
  
            notifDropdown.innerHTML = data.length
              ? data.map(n =>
                  `<p><strong>${n.admin_name}</strong> logged in at ${new Date(n.login_time).toLocaleString()}</p>`
                ).join('')
              : '<p>No recent logins</p>';
  
            notifDropdown.classList.add('loaded');
          } catch (err) {
            notifDropdown.innerHTML = '<p>Error loading notifications</p>';
          }
        }
      });
    }
  });
  