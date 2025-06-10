// Function to toggle password visibility
function togglePassword() {
  const passwordInput = document.getElementById('password');
  const toggleIcon = document.getElementById('toggleIcon');

  const isPassword = passwordInput.getAttribute('type') === 'password';
  passwordInput.setAttribute('type', isPassword ? 'text' : 'password');

  toggleIcon.classList.toggle('fa-eye');
  toggleIcon.classList.toggle('fa-eye-slash');
  
}

