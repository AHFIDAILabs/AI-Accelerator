import { Query } from 'mongoose';

const MAX_LIMIT = 100;

export class QueryHelper<T> {
  query: Query<T[], T>;
  queryString: any;

  constructor(query: Query<T[], T>, queryString: any) {
    this.query = query;
    this.queryString = queryString;
  }

  // ---------------- FILTER ----------------
  filter(allowedFields: string[] = []) {
    const queryObj = { ...this.queryString };
    const excluded = ['page', 'sort', 'limit', 'fields', 'search'];
    excluded.forEach(f => delete queryObj[f]);

    // Whitelist fields
    Object.keys(queryObj).forEach(key => {
      if (allowedFields.length && !allowedFields.includes(key)) {
        delete queryObj[key];
      }
    });

    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, m => `$${m}`);

    this.query = this.query.find(JSON.parse(queryStr));
    return this;
  }

  // ---------------- SORT ----------------
  sort(defaultSort = '-createdAt') {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort(defaultSort);
    }
    return this;
  }

  // ---------------- FIELD LIMIT ----------------
  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select('-__v');
    }
    return this;
  }

  // ---------------- PAGINATION ----------------
  paginate() {
    let page = parseInt(this.queryString.page, 10) || 1;
    let limit = parseInt(this.queryString.limit, 10) || 10;
    let query = this.query;

    page = Math.max(1, page);
    limit = Math.min(Math.max(1, limit), MAX_LIMIT);
query = this.query;

    const skip = (page - 1) * limit;
    this.query = this.query.skip(skip).limit(limit);

    return { page, limit, query };
  }

  // ---------------- SEARCH ----------------
  search(fields: string[]) {
    if (this.queryString.search) {
      const safeSearch = this.queryString.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const searchQuery = {
        $or: fields.map(field => ({
          [field]: { $regex: safeSearch, $options: 'i' },
        })),
      };

      this.query = this.query.find(searchQuery);
    }
    return this;
  }
}
