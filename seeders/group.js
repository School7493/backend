require("dotenv").config();

const sequelize = require("../config/db");
const { Group } = require("../models");
async function createAdmin (){
    try{
        await sequelize.sync();

        const name = ['أ', 'ب', 'ج', 'د', 'و']
    
    const data = ['التحضيري','السنة الأولى','السنة الثانية','السنة الثالثة','السنة الرابعة','السنة الخامسة','السنة السادسة',]
    for(const d of data){
      for(const n of name){
        await Group.create({level:d,name:n})
    }
    }
    console.log("group created");
    process.exit();
    }catch(err){
        console.log(err);
        process.exit();
    }
}
createAdmin()