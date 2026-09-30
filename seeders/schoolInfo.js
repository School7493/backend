require("dotenv").config();

const sequelize = require("../config/db");
const SchoolInfo = require("../models/SchoolInfo");
async function createSchool (){
    try{
        await sequelize.sync();
    await SchoolInfo.create({name:"École Elfaouar School",address:"Cité ELhouda - elfaouar",email:"contact@ecole.tn",phone:"+216 73 200 145",director:"Mrs Ibtissem ben boubaker",academic_year:"2026/2027",register_fee:70});
    console.log("School Info created");
    process.exit();
    }catch(err){
        console.log(err);
        process.exit();
    }
}
createSchool()