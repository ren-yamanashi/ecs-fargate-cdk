ALTER DATABASE `sample_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- sample_dbの権限を与える
GRANT ALL ON `sample_db`.* TO `default`@'%';

-- `prisma migrate dev`で必要なデータベースの権限を与える
GRANT CREATE, ALTER, DROP, REFERENCES ON *.* TO `default`@'%';

-- `my.cnf`では行えないcollationの設定を行う
SET PERSIST default_collation_for_utf8mb4=utf8mb4_general_ci;
