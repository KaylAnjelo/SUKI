document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('notificationsBtn');
  const dropdown = document.getElementById('notificationsDropdown');
  const list = document.getElementById('notificationsList');

  if (!btn || !dropdown || !list) {
    console.warn('Notification elements not found in the DOM.');
    return;
  }

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();

    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      try {
        const response = await fetch('/notifications');
        if (!response.ok) throw new Error('Network response was not ok');

        const logs = await response.json();
        list.innerHTML = '';

        if (logs.length === 0) {
          const li = document.createElement('li');
          li.textContent = 'No recent logins.';
          list.appendChild(li);
        } else {
          logs.forEach(log => {
            const loginDate = new Date(log.login_time);
            const newFormattedDate = `${loginDate.getDate()}/${loginDate.getMonth() + 1}/${loginDate.getFullYear()} at ${
              (loginDate.getHours() % 12) || 12
            }:${loginDate.getMinutes().toString().padStart(2, '0')} ${loginDate.getHours() >= 12 ? 'PM' : 'AM'}`;
            const li = document.createElement('li');
            li.textContent = `${log.admin_name} logged in on ${newFormattedDate}`;
            list.appendChild(li);
          });
        }

      } catch (err) {
        console.error('❌ Failed to fetch notifications:', err);
        dropdown.style.display = 'none';
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
});
