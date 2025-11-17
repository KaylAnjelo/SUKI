// public/js/notifications.js

document.addEventListener("DOMContentLoaded", function() {
  const notifBtn = document.getElementById('notificationsBtn');
  const notifDropdown = document.getElementById('notificationsDropdown');
  const notifList = document.getElementById('notificationsList');

  // Exit early if notification elements don't exist on this page
  if (!notifBtn || !notifDropdown || !notifList) {
    return;
  }

  notifBtn.addEventListener('click', async function() {
    notifDropdown.style.display = notifDropdown.style.display === 'block' ? 'none' : 'block';

    if (notifDropdown.style.display === 'block') {
      // Fetch notifications
      const res = await fetch('/notifications');
      const notifications = await res.json();

      notifList.innerHTML = '';
      if (notifications.length === 0) {
        notifList.innerHTML = '<li>No recent logins.</li>';
      } else {
        notifications.forEach(log => {
          const date = new Date(log.login_time);
          notifList.innerHTML += `
            <li>
              <strong>${log.username}</strong> logged in<br>
              <small>${date.toLocaleString()}</small>
            </li>
          `;
        });
      }
    }
  });

  // Optional: Hide dropdown when clicking outside
  document.addEventListener('click', function(e) {
    if (!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
      notifDropdown.style.display = 'none';
    }
  });
});