document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('notificationsBtn');
    const dropdown = document.getElementById('notificationsDropdown');
    const list = document.getElementById('notificationsList');

    btn.addEventListener('click', async () => {
      // Toggle display
      if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
        return;
      }

      // Fetch and display notifications
      try {
        const response = await fetch('/notifications');
        const logs = await response.json();

        list.innerHTML = '';
        logs.forEach(log => {
          const li = document.createElement('li');
          const time = new Date(log.login_time).toLocaleString();
          li.textContent = `${log.admin_name} logged in at ${time}`;
          list.appendChild(li);
        });

        dropdown.style.display = 'block';
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    });

    // Optional: Close dropdown if you click outside
    document.addEventListener('click', (e) => {
      if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  });