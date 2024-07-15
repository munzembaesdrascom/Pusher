const mysql = require("mysql2/promise");
const mysqls = require("mysql");

const MySQLEvents = require("@rodrigogs/mysql-events");
const dbConfig = require("../config");
const checkRole = require('../index');
const logger=require('../log')
//const getServerIps = require('../client/index');
const axios = require("axios");
const config = require("../config");

const getDbConnection = async () => {
  const connection = await mysql.createConnection(dbConfig);
  return connection;
};
const getClientIps = async () => {
  let connection;
  
  try {
      connection = await getDbConnection();
      const [rows] = await connection.query("SELECT agence_ip FROM tb_agence");
      console.log(rows.length);
      return rows.map((row) => row.agence_ip);
  } catch (error) {
      logger.error('Erreur de récupération des IPs des clients:', error);
      throw error;
  } finally {
      if (connection) await connection.end();
  }
};

const getServerIps = async () => {
  let connection;
  try {
      connection = await getDbConnection();
      const [rows] = await connection.query("SELECT url_master FROM tb_config_system");
      return rows.map((row) => row.url_master);
  } catch (error) {
      logger.error('Erreur de récupération des IPs des serveurs:', error);
      throw error;
  } finally {
      if (connection) await connection.end();
  }
};
(async () => {
  // Import dynamic module ora
  const ora = (await import("ora")).default;

  // Initialize spinner
  const spinner = ora({
    text: "🛸 Waiting for database events... 🛸",
    color: "blue",
    spinner: "dots2",
  });

  const program = async () => {
    const connection = mysqls.createConnection({
      host: dbConfig.host,
      user: config.user,
      password:config.password,
      port: config.port,
      database: dbConfig.database,
      charset: 'utf8mb4',  // Use utf8mb4 instead of UTF8
      authPlugins: {
        mysql_clear_password: () => () => Buffer.from('admin') // Example for clear password auth
      }
    });

    const instance = new MySQLEvents(connection, {
      startAtEnd: true,
    });

    await instance.start();

    instance.addTrigger({
      name: "monitoring all statements",
      expression: "extratime.tb_users",
      statement: MySQLEvents.STATEMENTS.ALL,
      onEvent: async (event) => {
        const { type, schema, table, affectedRows } = event;
console.log("salut biso yzyo");
        if (type === 'UPDATE' && schema === 'extratime' && table === 'tb_users') {
          affectedRows.forEach(async (row) => {
            const { after, before } = row;
            const tables = [
              {table: "tb_users", records: [after]}
            ];

            if(after.user_password != before.user_password){
              const isMaster = await checkRole();
              if (isMaster==1) {
                try{
                  const clientIps = await getClientIps();
                  console.log(clientIps);
                  for (clientIp of clientIps) {
                    console.log(clientIp);
                    await axios.post(`http://192.168.11.100:3005/sync`, {data:tables});
                    console.log(`http://${clientIp}:3005/sync`);
                  }
                }catch(error){
                  console.log(`Error d'envoie des données ${clientIp}`, error);
                }
              } else {
                try{
                  const serverIps = await getServerIps();
                  for (serverIp of serverIps) {
                    await axios.post(`http://${serverIp}:3005/sync`, {tables});
                  }
                }catch(error){
                  console.log(`Error d'envoie des données ${serverIp}`, error);
                }
              }
              console.log('Ne pas egal ', after.user_password,'!=',before.user_password);
            }

          });
        }

        
      },
    });

    instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, console.error);
    instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error);
  };

  // Start the program and handle spinner separately
  program()
    .then(() => {
      // You can continue your main program logic here
      console.log("MySQL event monitoring started.");
    })
    .catch((error) => {
      console.error("Error in MySQL event monitoring:", error);
    })
    .finally(() => {
      // Ensure spinner is started
      spinner.start();
    });
})();
