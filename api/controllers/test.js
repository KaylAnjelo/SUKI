import bcrypt from "bcrypt";
import supabase from "../../config/db.js";

const resetAdminPassword = async () => {
  const newPassword = "Admin123";   // your desired login password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const { error } = await supabase
    .from("admin")
    .update({ password: hashedPassword })
    .eq("username", "ADMIN1");

  if (error) {
    console.error("❌ Failed to reset password:", error);
  } else {
    console.log("✅ Password reset for ADMIN1");
  }
};

resetAdminPassword();
