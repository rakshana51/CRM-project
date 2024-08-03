import express from "express";
import path from "path";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";

const __dirname = path.resolve(); // Use path.resolve() to get the absolute path of the current directory

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "World",
  password: "2004",
  port: 5432,
});

const app = express();
const port = 3000;

db.connect()
  .then(() => {
    console.log("Connected to the database");
  })
  .catch(err => {
    console.error("Error connecting to the database:", err);
  });

let customer = [];
let products = [];
let sales = [];

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(session({
  secret: 'secret-key', // Replace with a more secure key
  resave: false,
  saveUninitialized: true,
}));

// Middleware to check if the user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    return next();
  }
  res.redirect('/login');
};

// Route for the home page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];
    
    if (user && await bcrypt.compare(password, user.password)) {
      req.session.userId = user.user_id;
      req.session.role = user.role;
      res.redirect("/");
    } else {
      res.status(401).send("Invalid credentials");
    }
  } catch (err) {
    console.error("Error logging in:", err);
    res.status(500).send("Error logging in");
  }
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.post("/register", async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)", [username, hashedPassword, role]);
    res.redirect("/login");
  } catch (err) {
    console.error("Error registering user:", err);
    res.status(500).send("Error registering user");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Rest of your routes
app.get("/manage-customers", isAuthenticated, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM customer");
    customer = result.rows;
    res.render("manage_customers.ejs", { customer });
  } catch (err) {
    console.error("Error fetching customers:", err);
    res.status(500).send("Error fetching customers");
  }
});

app.post("/add-customer", isAuthenticated, async (req, res) => {
  const { name, email, phno, address } = req.body;
  try {
    await db.query("INSERT INTO customer (name, email, phno, address) VALUES ($1, $2, $3, $4)", [name, email, phno, address]);
    console.log("Customer added successfully");
    res.redirect("/manage-customers");
  } catch (err) {
    console.error("Error adding customer:", err);
    res.status(500).send("Error adding customer");
  }
});

app.delete("/delete-customer/:id", isAuthenticated, async (req, res) => {
  const customerId = req.params.id;
  try {
    await db.query("DELETE FROM customer WHERE cusid = $1", [customerId]);
    console.log("Customer deleted successfully");
    res.sendStatus(200);
  } catch (err) {
    console.error("Error deleting customer:", err);
    res.status(500).send("Error deleting customer");
  }
});

app.get("/manage-products", isAuthenticated, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM products");
    products = result.rows;
    res.render("manage_products.ejs", { products });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).send("Error fetching products");
  }
});

app.post("/add-product", isAuthenticated, async (req, res) => {
  const { pname, pdescription, price } = req.body;
  try {
    await db.query("INSERT INTO products (pname, pdescription, price) VALUES ($1, $2, $3)", [pname, pdescription, price]);
    console.log("Product added successfully");
    res.redirect("/manage-products");
  } catch (err) {
    console.error("Error adding product:", err);
    res.status(500).send("Error adding product");
  }
});

app.delete("/delete-product/:id", isAuthenticated, async (req, res) => {
  const productId = req.params.id;
  try {
    await db.query("DELETE FROM products WHERE pid = $1", [productId]);
    console.log("Product deleted successfully");
    res.sendStatus(200);
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).send("Error deleting product");
  }
});

app.get("/manage-sales", isAuthenticated, async (req, res) => {
  try {
    const salesResult = await db.query(`
      SELECT s.sale_id, s.quantity, s.total_price, s.sale_date, c.name AS customer_name, p.pname AS product_name 
      FROM sales s
      JOIN customer c ON s.customer_id = c.cusid
      JOIN products p ON s.product_id = p.pid
    `);
    sales = salesResult.rows;
    const customersResult = await db.query("SELECT * FROM customer");
    const productsResult = await db.query("SELECT * FROM products");
    res.render("manage_sales.ejs", { sales, customers: customersResult.rows, products: productsResult.rows });
  } catch (err) {
    console.error("Error fetching sales:", err);
    res.status(500).send("Error fetching sales");
  }
});

// Route to add a new sale
app.post("/add-sale", isAuthenticated, async (req, res) => {
  const { product_id, customer_id, quantity } = req.body;
  try {
    // Fetch product price to calculate total price
    const productResult = await db.query("SELECT price FROM products WHERE pid = $1", [product_id]);
    const productPrice = productResult.rows[0].price;
    const totalPrice = productPrice * quantity;

    await db.query(
      "INSERT INTO sales (product_id, customer_id, quantity, total_price) VALUES ($1, $2, $3, $4)",
      [product_id, customer_id, quantity, totalPrice]
    );
    console.log("Sale added successfully");
    res.redirect("/manage-sales");
  } catch (err) {
    console.error("Error adding sale:", err);
    res.status(500).send("Error adding sale");
  }
});

// Route to delete a sale
app.delete("/delete-sale/:id", isAuthenticated, async (req, res) => {
  const saleId = req.params.id;
  try {
    await db.query("DELETE FROM sales WHERE sale_id = $1", [saleId]);
    console.log("Sale deleted successfully");
    res.sendStatus(200);
  } catch (err) {
    console.error("Error deleting sale:", err);
    res.status(500).send("Error deleting sale");
  }
});

// Route for Dashboard
app.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    // Fetch summary data
    const totalSalesResult = await db.query("SELECT SUM(total_price) AS total_sales FROM sales");
    const totalCustomersResult = await db.query("SELECT COUNT(DISTINCT customer_id) AS total_customers FROM sales");
    const totalProductsSoldResult = await db.query("SELECT SUM(quantity) AS total_products_sold FROM sales");
    
    // Fetch sales data for graph
    const salesByDateResult = await db.query(`
      SELECT DATE(sale_date) AS sale_date, SUM(total_price) AS total_sales
      FROM sales
      GROUP BY DATE(sale_date)
      ORDER BY sale_date
    `);

    const dashboardData = {
      totalSales: totalSalesResult.rows[0].total_sales || 0,
      totalCustomers: totalCustomersResult.rows[0].total_customers || 0,
      totalProductsSold: totalProductsSoldResult.rows[0].total_products_sold || 0,
      salesByDate: salesByDateResult.rows,
    };

    res.render("dashboard.ejs", { dashboardData });
  } catch (err) {
    console.error("Error fetching dashboard data:", err);
    res.status(500).send("Error fetching dashboard data");
  }
});


app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

