import bcrypt from "bcrypt";
import supabase from "../../config/db.js";

console.log("🔎 URL:", process.env.SUPABASE_URL);
console.log("🔎 Key length:", process.env.SUPABASE_SERVICE_ROLE_KEY?.length);


export const login = async (req, res) => {
  const username = req.body.username?.trim();
  const password = req.body.password?.trim();

  if (!username || !password) {
    return res.render("index", { error: "Please enter both username and password" });
  }

  try {
    const { data: user, error } = await supabase
      .from("admin")
      .select("id, username, password")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("Database error:", error);
      return res.render("index", { error: "Error checking credentials" });
    }

    if (!user) {
      return res.render("index", { error: "Invalid username or password" });
    }

    console.log("🔎 User from DB:", user);

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.render("index", { error: "Invalid username or password" });
    }

    // Optional: store session
    req.session.user = { id: user.id, username: user.username };

    await supabase.from("admin_logs").insert([
      { admin_name: username, login_time: new Date().toISOString() }
    ]);

    return res.redirect("/dashboard");
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.render("index", { error: "Server error. Please try again." });
  }
};

export const logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
};
