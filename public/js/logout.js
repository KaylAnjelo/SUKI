document.addEventListener('DOMContentLoaded', () => {
    const logoutForm = document.getElementById('logoutForm');
    if (logoutForm) {
      // Create modal elements
      const modal = document.createElement('div');
      modal.id = 'logoutModal';
      modal.style.cssText = `
        display: none;
        position: fixed;
        z-index: 10000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.5);
        animation: fadeIn 0.3s;
        align-items: center;
        justify-content: center;
      `;

      const modalContent = document.createElement('div');
      modalContent.style.cssText = `
        background-color: #fefefe;
        padding: 30px;
        border: none;
        border-radius: 12px;
        width: 90%;
        max-width: 400px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        animation: slideIn 0.3s;
      `;

      modalContent.innerHTML = `
        <div style="text-align: center;">
          <h2 style="margin: 0 0 15px 0; color: #333; font-size: 24px;">Confirm Logout</h2>
          <p style="color: #666; margin-bottom: 30px; font-size: 16px;">Are you sure you want to log out?</p>
          <div style="display: flex; gap: 10px; justify-content: center;">
            <button id="cancelLogout" style="
              padding: 12px 30px;
              background-color: #6c757d;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 16px;
              transition: background-color 0.3s;
            ">Cancel</button>
            <button id="confirmLogout" style="
              padding: 12px 30px;
              background-color: #f44336;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 16px;
              transition: background-color 0.3s;
            ">Log Out</button>
          </div>
        </div>
      `;

      modal.appendChild(modalContent);
      document.body.appendChild(modal);

      // Add CSS animations
      const style = document.createElement('style');
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { transform: translateY(-50px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        #cancelLogout:hover {
          background-color: #5a6268 !important;
        }
        #confirmLogout:hover {
          background-color: #d32f2f !important;
        }
      `;
      document.head.appendChild(style);

      // Handle logout form submission
      logoutForm.addEventListener('submit', function (e) {
        e.preventDefault();
        modal.style.display = 'flex';
      });

      // Cancel button
      document.getElementById('cancelLogout').addEventListener('click', function() {
        modal.style.display = 'none';
      });

      // Confirm button
      document.getElementById('confirmLogout').addEventListener('click', function() {
        logoutForm.submit();
      });

      // Close modal when clicking outside
      window.addEventListener('click', function(event) {
        if (event.target === modal) {
          modal.style.display = 'none';
        }
      });

      // Close modal on Escape key
      document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal.style.display === 'block') {
          modal.style.display = 'none';
        }
      });
    }
  });
  