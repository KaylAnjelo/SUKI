import bcrypt from 'bcrypt';
import supabase from './config/db.js';

const hashExistingPasswords = async () => {
  try {
    console.log('🔐 Starting password hashing process...');
    
    // Get all users with plaintext passwords (passwords that don't start with $2b$)
    const { data: users, error } = await supabase
      .from('users')
      .select('user_id, username, password')
      .not('password', 'like', '$2b$%'); // Get passwords that don't start with $2b$ (bcrypt format)

    if (error) {
      console.error('❌ Error fetching users:', error);
      return;
    }

    if (!users || users.length === 0) {
      console.log('✅ All passwords are already hashed!');
      return;
    }

    console.log(`🔍 Found ${users.length} users with plaintext passwords:`);
    users.forEach(user => {
      console.log(`   - ${user.username} (ID: ${user.user_id})`);
    });

    console.log('\n🔄 Starting to hash passwords...');

    for (const user of users) {
      try {
        console.log(`🔐 Hashing password for: ${user.username}`);
        
        // Hash the plaintext password with salt rounds of 10
        const hashedPassword = await bcrypt.hash(user.password, 10);
        
        // Update the password in the database
        const { error: updateError } = await supabase
          .from('users')
          .update({ password: hashedPassword })
          .eq('user_id', user.user_id);
          
        if (updateError) {
          console.error(`❌ Error updating password for ${user.username}:`, updateError);
          continue;
        }
        
        console.log(`✅ Successfully updated password for: ${user.username}`);
        
        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (hashError) {
        console.error(`❌ Error hashing password for ${user.username}:`, hashError);
      }
    }
    
    console.log('\n🎉 Password hashing process completed!');
    console.log('📝 All passwords have been converted from plaintext to bcrypt hashes.');
    console.log('🔒 Your login system is now more secure.');
    
    // Verify the hashing worked
    console.log('\n🔍 Verifying hashed passwords...');
    const { data: verifyUsers, error: verifyError } = await supabase
      .from('users')
      .select('user_id, username, password')
      .like('password', '$2b$%'); // Get passwords that start with $2b$ (bcrypt format)
      
    if (verifyError) {
      console.error('❌ Error verifying:', verifyError);
    } else {
      console.log(`✅ Verified: ${verifyUsers?.length || 0} users now have hashed passwords`);
    }
    
  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
};

// Run the script
hashExistingPasswords();