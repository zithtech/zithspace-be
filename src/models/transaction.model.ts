import pool from "../config/dbpool";

export interface Transaction {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  amount: number;
  description: string;
  category?: string | null;
  date: Date;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  user?: any;
}

export interface GetTransactionsOptions {
  page?: number;
  limit?: number;
  type?: string;
  category?: string;
  userId?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export async function getTransactions(
  tenantId: string,
  options: GetTransactionsOptions = {}
): Promise<{ transactions: Transaction[]; total: number }> {
  const {
    page = 1,
    limit = 20,
    type,
    category,
    userId,
    startDate,
    endDate,
    search,
    sortBy = 'date',
    sortOrder = 'desc'
  } = options;

  const whereConditions: string[] = ['t.tenant_id = $1'];
  const values: any[] = [tenantId];
  let paramIndex = 2;

  if (type) {
    whereConditions.push(`t.type = $${paramIndex++}`);
    values.push(type);
  }

  if (category) {
    whereConditions.push(`t.category = $${paramIndex++}`);
    values.push(category);
  }

  if (userId) {
    whereConditions.push(`t.user_id = $${paramIndex++}`);
    values.push(userId);
  }

  if (startDate && endDate) {
    whereConditions.push(`t.date >= $${paramIndex++}`);
    values.push(startDate);
    
    whereConditions.push(`t.date <= $${paramIndex++}`);
    values.push(endDate);
  }

  if (search) {
    whereConditions.push(`(t.description ILIKE $${paramIndex} OR t.category ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})`);
    values.push(`%${search}%`);
    paramIndex++;
  }

  // Map sort fields to snake case table columns
  let dbColumnName = sortBy;
  if (sortBy === 'date') dbColumnName = 't.date';
  else if (sortBy === 'createdAt') dbColumnName = 't.created_at';
  else if (sortBy === 'amount') dbColumnName = 't.amount';
  else if (sortBy === 'type') dbColumnName = 't.type';
  else dbColumnName = `t.${sortBy}`;

  const orderByClause = `ORDER BY ${dbColumnName} ${sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}, t.created_at DESC`;
  const offset = (page - 1) * limit;

  // We join users table, and optionally positions to match the typical Prisma include
  const query = `
    SELECT 
      t.id, t.tenant_id, t.user_id, t.type, t.amount, t.description, t.category, t.date, t.metadata, t.created_at, t.updated_at,
      json_build_object(
        'id', u.id,
        'name', u.name,
        'workEmail', u.work_email,
        'avatarUrl', u.avatar_url,
        'position', CASE WHEN p.id IS NOT NULL THEN json_build_object(
          'id', p.id,
          'tenantId', p.tenant_id,
          'code', p.code,
          'title', p.title,
          'departmentId', p.department_id,
          'subDepartmentId', p.sub_department_id,
          'gradeId', p.grade_id,
          'description', p.description,
          'isActive', p.is_active,
          'createdById', p.created_by_id,
          'updatedById', p.updated_by_id,
          'createdAt', p.created_at,
          'updatedAt', p.updated_at
        ) ELSE NULL END
      ) as user
    FROM transactions t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN positions p ON u.position_id = p.id
    WHERE ${whereConditions.join(' AND ')}
    ${orderByClause}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  values.push(limit, offset);

  const countQuery = `
    SELECT COUNT(*) as total
    FROM transactions t
    LEFT JOIN users u ON t.user_id = u.id
    WHERE ${whereConditions.join(' AND ')}
  `;

  const [invoicesResult, countResult] = await Promise.all([
    pool.query(query, values),
    pool.query(countQuery, values.slice(0, -2))
  ]);

  const transactions = invoicesResult.rows.map((row): Transaction => {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      type: row.type,
      amount: parseFloat(row.amount),
      description: row.description,
      category: row.category,
      date: row.date,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      user: row.user
    };
  });

  return {
    transactions,
    total: parseInt(countResult.rows[0].total)
  };
}

export async function getTransactionById(id: string, tenantId: string): Promise<Transaction | null> {
  const query = `
    SELECT 
      t.id, t.tenant_id, t.user_id, t.type, t.amount, t.description, t.category, t.date, t.metadata, t.created_at, t.updated_at,
      json_build_object(
        'id', u.id,
        'name', u.name,
        'workEmail', u.work_email,
        'avatarUrl', u.avatar_url,
        'position', CASE WHEN p.id IS NOT NULL THEN json_build_object(
          'title', p.title
        ) ELSE NULL END
      ) as user
    FROM transactions t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN positions p ON u.position_id = p.id
    WHERE t.id = $1 AND t.tenant_id = $2
  `;

  const result = await pool.query(query, [id, tenantId]);
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    type: row.type,
    amount: parseFloat(row.amount),
    description: row.description,
    category: row.category,
    date: row.date,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: row.user
  };
}

export async function checkUserInTenant(userId: string, tenantId: string): Promise<any | null> {
  const query = `SELECT id, name, work_email, position_id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true`;
  const res = await pool.query(query, [userId, tenantId]);
  return res.rows.length > 0 ? res.rows[0] : null;
}

export async function createTransaction(data: any, tenantId: string): Promise<Transaction | null> {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  
  const query = `
    INSERT INTO transactions (
      id, tenant_id, user_id, type, amount, description, category, date, metadata, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
  `;
  
  await pool.query(query, [
    id,
    tenantId,
    data.userId,
    data.type,
    data.amount,
    data.description,
    data.category || null,
    data.date ? new Date(data.date) : new Date(),
    data.metadata || {}
  ]);
  
  return getTransactionById(id, tenantId);
}

export async function updateTransaction(id: string, tenantId: string, updates: any): Promise<Transaction | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;
  
  if (updates.type !== undefined) { setClause.push(`type = $${paramIndex++}`); values.push(updates.type); }
  if (updates.amount !== undefined) { setClause.push(`amount = $${paramIndex++}`); values.push(updates.amount); }
  if (updates.description !== undefined) { setClause.push(`description = $${paramIndex++}`); values.push(updates.description); }
  if (updates.category !== undefined) { setClause.push(`category = $${paramIndex++}`); values.push(updates.category); }
  if (updates.date !== undefined) { setClause.push(`date = $${paramIndex++}`); values.push(new Date(updates.date)); }
  if (updates.metadata !== undefined) { setClause.push(`metadata = $${paramIndex++}`); values.push(updates.metadata); }
  
  setClause.push(`updated_at = CURRENT_TIMESTAMP`);
  
  if (setClause.length === 1) return getTransactionById(id, tenantId);
  
  const query = `
    UPDATE transactions 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
  `;
  values.push(id, tenantId);
  
  await pool.query(query, values);
  return getTransactionById(id, tenantId);
}

export async function deleteTransactionQuery(id: string, tenantId: string): Promise<boolean> {
  const query = `DELETE FROM transactions WHERE id = $1 AND tenant_id = $2`;
  const result = await pool.query(query, [id, tenantId]);
  return result.rowCount > 0;
}

export async function getUserBalanceQuery(userId: string, tenantId: string): Promise<any> {
  const userQuery = `SELECT id, name, work_email as "workEmail" FROM users WHERE id = $1 AND tenant_id = $2`;
  const userRes = await pool.query(userQuery, [userId, tenantId]);
  if (userRes.rows.length === 0) return null;
  const user = userRes.rows[0];

  const aggQuery = `SELECT type, SUM(amount) as amount FROM transactions WHERE user_id = $1 AND tenant_id = $2 GROUP BY type`;
  const aggRes = await pool.query(aggQuery, [userId, tenantId]);
  
  let income = 0, expense = 0, bonus = 0, deduction = 0;
  for (const row of aggRes.rows) {
    const amount = parseFloat(row.amount);
    if (row.type === 'income') income = amount;
    else if (row.type === 'expense') expense = amount;
    else if (row.type === 'bonus') bonus = amount;
    else if (row.type === 'deduction') deduction = amount;
  }

  const totalCredits = income + bonus;
  const totalDebits = expense + deduction;
  const netBalance = totalCredits - totalDebits;

  return {
    user,
    balance: {
      income, expense, bonus, deduction, totalCredits, totalDebits, netBalance
    }
  };
}

export async function getAccountBalanceQuery(tenantId: string): Promise<any> {
  const aggQuery = `SELECT type, SUM(amount) as amount, COUNT(*) as count FROM transactions WHERE tenant_id = $1 GROUP BY type`;
  const aggRes = await pool.query(aggQuery, [tenantId]);
  
  let income = 0, incomeCount = 0;
  let expense = 0, expenseCount = 0;
  let bonus = 0, bonusCount = 0;
  let deduction = 0, deductionCount = 0;

  for (const row of aggRes.rows) {
    const amount = parseFloat(row.amount);
    const count = parseInt(row.count);
    if (row.type === 'income') { income = amount; incomeCount = count; }
    else if (row.type === 'expense') { expense = amount; expenseCount = count; }
    else if (row.type === 'bonus') { bonus = amount; bonusCount = count; }
    else if (row.type === 'deduction') { deduction = amount; deductionCount = count; }
  }

  const totalCredits = income + bonus;
  const totalDebits = expense + deduction;
  const netBalance = totalCredits - totalDebits;
  const totalTransactions = incomeCount + expenseCount + bonusCount + deductionCount;

  return {
    balance: { income, expense, bonus, deduction, totalCredits, totalDebits, netBalance },
    counts: { income: incomeCount, expense: expenseCount, bonus: bonusCount, deduction: deductionCount, totalTransactions }
  };
}

export async function getMonthlySummaryQuery(tenantId: string, startDate: Date, endDate: Date, year: number, month: number, monthName: string): Promise<any> {
  const aggQuery = `
    SELECT type, SUM(amount) as amount, COUNT(*) as count 
    FROM transactions 
    WHERE tenant_id = $1 AND date >= $2 AND date <= $3
    GROUP BY type
  `;
  const aggRes = await pool.query(aggQuery, [tenantId, startDate, endDate]);
  
  let income = 0, incomeCount = 0;
  let expense = 0, expenseCount = 0;
  let bonus = 0, bonusCount = 0;
  let deduction = 0, deductionCount = 0;

  for (const row of aggRes.rows) {
    const amount = parseFloat(row.amount);
    const count = parseInt(row.count);
    if (row.type === 'income') { income = amount; incomeCount = count; }
    else if (row.type === 'expense') { expense = amount; expenseCount = count; }
    else if (row.type === 'bonus') { bonus = amount; bonusCount = count; }
    else if (row.type === 'deduction') { deduction = amount; deductionCount = count; }
  }

  const totalCredits = income + bonus;
  const totalDebits = expense + deduction;
  const netAmount = totalCredits - totalDebits;
  const totalTransactions = incomeCount + expenseCount + bonusCount + deductionCount;

  return {
    year, month, monthName,
    summary: { income, expense, bonus, deduction, totalCredits, totalDebits, netAmount },
    counts: { income: incomeCount, expense: expenseCount, bonus: bonusCount, deduction: deductionCount, totalTransactions }
  };
}

export async function getTransactionSummaryQuery(tenantId: string, start?: Date, end?: Date): Promise<any> {
  let dateCondition = '';
  const values: any[] = [tenantId];
  let paramIndex = 2;
  
  if (start && end) {
    dateCondition = `AND date >= $${paramIndex++} AND date <= $${paramIndex++}`;
    values.push(start, end);
  }

  const overallQuery = `SELECT type, SUM(amount) as amount, COUNT(*) as count FROM transactions WHERE tenant_id = $1 ${dateCondition} GROUP BY type`;
  const overallRes = await pool.query(overallQuery, values);
  
  let totalCredits = 0, totalDebits = 0, creditCount = 0, debitCount = 0;

  for (const row of overallRes.rows) {
    const amount = parseFloat(row.amount);
    const count = parseInt(row.count);
    if (row.type === 'income' || row.type === 'bonus' || row.type === 'credit') {
      totalCredits += amount; creditCount += count;
    } else {
      totalDebits += amount; debitCount += count;
    }
  }

  const catQuery = `
    SELECT category, SUM(amount) as amount, COUNT(*) as count 
    FROM transactions 
    WHERE tenant_id = $1 AND category IS NOT NULL ${dateCondition} 
    GROUP BY category 
    ORDER BY amount DESC
  `;
  const catRes = await pool.query(catQuery, values);
  const formattedCategoryBreakdown = catRes.rows.map(row => ({
    category: row.category,
    total: parseFloat(row.amount),
    count: parseInt(row.count),
  }));

  let recentQuery = `
    SELECT 
      t.id, t.tenant_id, t.user_id, t.type, t.amount, t.description, t.category, t.date, t.metadata, t.created_at, t.updated_at,
      json_build_object(
        'id', u.id,
        'name', u.name,
        'workEmail', u.work_email,
        'avatarUrl', u.avatar_url,
        'position', CASE WHEN p.id IS NOT NULL THEN json_build_object('title', p.title) ELSE NULL END
      ) as user
    FROM transactions t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN positions p ON u.position_id = p.id
    WHERE t.tenant_id = $1 ${dateCondition}
    ORDER BY t.created_at DESC
    LIMIT 10
  `;
  
  const recentRes = await pool.query(recentQuery, values);
  const transformedRecentTransactions = recentRes.rows.map((row) => ({
    id: row.id,
    type: (row.type === 'income' || row.type === 'bonus' || row.type === 'credit') ? 'credit' : 'debit',
    amount: parseFloat(row.amount),
    description: row.description,
    category: row.category,
    date: row.date,
    metadata: row.metadata,
    member: row.user
  }));

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);

  const monthQuery = `
    SELECT type, SUM(amount) as amount
    FROM transactions 
    WHERE tenant_id = $1 AND date >= $2 AND date <= $3 
    GROUP BY type
  `;
  const monthRes = await pool.query(monthQuery, [tenantId, startOfMonth, endOfMonth]);
  
  let monthCredits = 0, monthDebits = 0;
  for (const row of monthRes.rows) {
    const amount = parseFloat(row.amount);
    if (row.type === 'income' || row.type === 'bonus' || row.type === 'credit') {
      monthCredits += amount;
    } else {
      monthDebits += amount;
    }
  }

  return {
    balance: {
      credits: totalCredits,
      debits: totalDebits,
      net: totalCredits - totalDebits,
      creditCount,
      debitCount,
      totalCount: creditCount + debitCount,
    },
    categoryBreakdown: formattedCategoryBreakdown,
    monthlyTrend: [{
      month: now.toLocaleString('default', { month: 'long' }),
      year: now.getFullYear(),
      credits: monthCredits,
      debits: monthDebits,
      net: monthCredits - monthDebits
    }],
    recentTransactions: transformedRecentTransactions,
  };
}
