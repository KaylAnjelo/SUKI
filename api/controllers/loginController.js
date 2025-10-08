import bcrypt from "bcrypt";
import crypto from "crypto";
import supabase from "../../config/db.js";

console.log("🔎 URL:", process.env.SUPABASE_URL);
console.log("🔎 Key length:", process.env.SUPABASE_SERVICE_ROLE_KEY?.length);

/**
 * Remember Me Functionality:
 * - When "Remember me" is checked, a secure cookie is set with user data and a random token
 * - Cookie expires in 30 days and is httpOnly for security
 * - Session is extended to 30 days for remember me users
 * - Middleware in app.js automatically restores sessions from valid remember me cookies
 * - Cookies are cleared on logout or when invalid
 */

export const login = async (req, res) => {
  const username = req.body.username?.trim();
  const password = req.body.password?.trim();
  const rememberMe = req.body.remember === 'on'; // Checkbox sends 'on' when checked

  if (!username || !password) {
    return res.render("index", { error: "Please enter both username and password" });
  }

  try {
    // Select all necessary fields including role
    const { data: user, error } = await supabase
      .from("users")
      .select("user_id, username, password, first_name, last_name, role")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("Database error:", error);
      return res.render("index", { error: "Error checking credentials" });
    }

    if (!user) {
      return res.render("index", { error: "Invalid username or password" });
    }

    console.log("🔎 User from DB:", { 
      user_id: user.user_id, 
      username: user.username, 
      role: user.role 
    });

    // Use bcrypt to compare the password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.render("index", { error: "Invalid username or password" });
    }

    // Store user session with all necessary data
    req.session.user = { 
      id: user.user_id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role
    };
    req.session.userId = user.user_id; // Also store userId for compatibility

    // Handle remember me functionality
    if (rememberMe) {
      // Generate a secure token for remember me
      const rememberToken = crypto.randomBytes(32).toString('hex');
      
      // Set remember me cookie (expires in 30 days)
      const rememberMeData = {
        userId: user.user_id,
        token: rememberToken,
        username: user.username
      };
      
      res.cookie('rememberMe', JSON.stringify(rememberMeData), {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        secure: false, // Set to true in production with HTTPS
        sameSite: 'lax'
      });
      
      // Extend session duration for remember me users
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      console.log("🍪 Remember me cookie set for user:", user.username);
    } else {
      // Clear any existing remember me cookie if not checked
      res.clearCookie('rememberMe');
    }

    // Log the successful login to user_logs table
    try {
      await supabase.from("user_logs").insert([
        { 
          user_id: user.user_id,
          username: username, 
        }
      ]);
      console.log("✅ Login logged successfully");
    } catch (logError) {
      console.error("Error logging login:", logError);
      // Don't fail the login if logging fails
    }

    // Role-based routing
    switch (user.role) {
      case 'admin':
        console.log("🔐 Admin login detected, redirecting to AdminDashboard");
        console.log("🔍 About to redirect to: /admin-dashboard");
        return res.redirect("/admin-dashboard");
        
      case 'owner':
        console.log("👑 Owner login detected, redirecting to OwnerDashboard");
        console.log("🔍 About to redirect to: /owner-dashboard");
        return res.redirect("/owner/dashboard");
        
      case 'customer':
      default:
        console.log("👤 Customer login detected, redirecting to default dashboard");
        console.log("🔍 About to redirect to: /dashboard");
        return res.redirect("/dashboard");
    }

  } catch (err) {
    console.error("Unexpected error:", err);
    return res.render("index", { error: "Server error. Please try again." });
  }
};

export const logout = async (req, res) => {
  try {
    // Log the logout if user session exists
    if (req.session.user) {
      await supabase.from("user_logs").insert([
        { 
          user_id: req.session.user.id,
          username: req.session.user.username, 
          login_time: new Date().toISOString(),
          action: 'logout'
        }
      ]);
      console.log("✅ Logout logged successfully");
    }
  } catch (logError) {
    console.error("Error logging logout:", logError);
    // Don't fail the logout if logging fails
  }

  // Clear remember me cookie on logout
  res.clearCookie('rememberMe', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  });
  
  req.session.destroy(() => {
    res.redirect("/");
  });
};