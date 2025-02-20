const Offert = require('../models/offerts.model.js');
const Category = require('../models/categorys.model.js');
const Enterprise = require('../models/enterprises.model.js');
const asyncHandler = require('express-async-handler');
const slugify = require('slugify');
const User = require('../models/users.model.js');

// CREATE NUEVA OFFERT
const createOffert = asyncHandler(async (req, res) => {
    const { title, company, location, description, requirements, salary, image, categorySlug, isActive } = req.body;

    const categoryObj = await Category.findOne({ slug: categorySlug }).exec();
    if (!categoryObj) return res.status(400).json({ error: 'Categoría no encontrada' });

    const enterprise = await Enterprise.findOne({ name: company }).exec();
    if (!enterprise) return res.status(400).json({ error: 'Empresa no encontrada' });

    const randomToken = Math.random().toString(36).substring(2, 8);

    const newOffert = new Offert({
        title,
        company: enterprise.name,
        company_slug: enterprise.slug,
        location,
        description,
        requirements,
        salary,
        category: categoryObj._id,
        slug: `${slugify(title, { lower: true })}-${randomToken}`,
        image,
        categorySlug: categoryObj.slug,
        favouritesCount: 0,
        comments: [],
        isActive: isActive !== undefined ? isActive : true // Asegúrate que isActive sea true por defecto
    });

    const savedOffert = await newOffert.save();
    res.status(201).json(savedOffert);
});

// FIND ALL OFFERTS
const findAllOfferts = asyncHandler(async (req, res) => {
    let query = { isActive: true }; // Asegúrate de filtrar por isActive
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const title = req.query.title || '';
    const location = req.query.location || '';

    if (title) {
        query.title = { $regex: new RegExp(title, 'i') };
    }
    if (location) {
        query.location = location;
    }

    const offerts = await Offert.find(query).limit(limit).skip(offset);
    const offertCount = await Offert.countDocuments(query);

    return res.status(200).json({ offerts, count: offertCount });
});

// FIND ONE OFFERT
const findOneOffert = asyncHandler(async (req, res) => {
    const offert = await Offert.findOne({ slug: req.params.slug, isActive: true }); // Asegúrate de que isActive sea true

    if (!offert) {
        return res.status(404).json({ message: 'Offert not found' });
    }

    return res.status(200).json(offert);
});

// DELETE ONE OFFERT
const deleteOneOffert = asyncHandler(async (req, res) => {
    const result = await Offert.deleteOne({ slug: req.params.slug });

    if (result.deletedCount === 0) {
        return res.status(404).json({ message: 'Offert not found' });
    }

    return res.status(200).json({ message: 'Offert deleted' });
});

// UPDATE OFFERT
const updateOffert = asyncHandler(async (req, res) => {
    const updatedOffert = await Offert.findOneAndUpdate(
        { slug: req.params.slug, isActive: true }, // Asegúrate de que isActive sea true
        req.body,
        { new: true, runValidators: true }
    );

    if (!updatedOffert) {
        return res.status(404).json({ message: 'Offert not found' });
    }

    return res.status(200).json(updatedOffert);
});

// FAVORITE OFFER
const favoriteOffert = asyncHandler(async (req, res) => {
    const userId = req.userId; 
    const { slug } = req.params; 
    
    const user = await User.findById(userId).exec();
    const offert = await Offert.findOne({ slug, isActive: true }).exec(); // Asegúrate de que isActive sea true

    if (!user || !offert) {
        return res.status(404).json({ message: "Offert or User Not Found" });
    }

    if (!offert.favorites.includes(userId)) {
        offert.favorites.push(userId);
        await offert.updateFavoriteCount();
        await offert.save();
    }

    return res.status(200).json({ offert: await offert.toOffertResponse(user) });
});

// UNFAVORITE OFFER
const unfavoriteOffert = asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { slug } = req.params;

    const user = await User.findById(userId).exec();
    const offert = await Offert.findOne({ slug, isActive: true }).exec(); // Asegúrate de que isActive sea true

    if (!user || !offert) {
        return res.status(404).json({ message: "Offert or User Not Found" });
    }

    const index = offert.favorites.indexOf(userId);
    if (index !== -1) {
        offert.favorites.splice(index, 1);
        offert.favouritesCount = offert.favorites.length;
        await offert.save();
    }

    return res.status(200).json({ offert: await offert.toOffertResponse(user) });
});

// FEED OFFERTS (offers from followed companies)
const feedOfferts = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const user = await User.findById(req.userId).exec();
    const filteredOfferts = await Offert.find({ company_slug: { $in: user.followingCompanies }, isActive: true }) // Asegúrate de que isActive sea true
        .limit(limit)
        .skip(offset)
        .exec();

    const offertCount = await Offert.countDocuments({ company_slug: { $in: user.followingCompanies }, isActive: true }); // Asegúrate de que isActive sea true

    return res.status(200).json({
        offerts: await Promise.all(filteredOfferts.map(async offert => await offert.toOffertResponse(user))),
        count: offertCount
    });
});

// GET COUNT OF FAVORITES
const getFavoriteCount = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    const offert = await Offert.findOne({ slug, isActive: true }).exec(); // Asegúrate de que isActive sea true

    if (!offert) {
        return res.status(404).json({ message: 'Offert not found' });
    }

    return res.status(200).json({ favoritesCount: offert.favouritesCount });
});

// OBTENER OFERTAS FAVORITAS DEL USUARIO
const getUserFavorites = asyncHandler(async (req, res) => {
    const userId = req.userId;

    const user = await User.findById(userId).exec();
    if (!user) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const favorites = await Offert.find({ favorites: { $in: [userId] }, isActive: true }).exec(); // Asegúrate de que isActive sea true

    if (!favorites || favorites.length === 0) {
        return res.status(200).json({ offerts: [], message: 'No tienes ofertas favoritas' });
    }

    return res.status(200).json({ offerts: favorites });
});

// Filtrar y buscar ofertas
const filterAndSearchOfferts = asyncHandler(async (req, res) => {
    const { category, company, salaryMin, salaryMax, searchTerm, offset, limit } = req.query;

    let query = { isActive: true }; // Asegúrate de filtrar por isActive

    if (category) {
        query.categorySlug = category;
    }
    if (company) {
        query.company_slug = company;
    }
    if (salaryMin || salaryMax) {
        query.salary = {};
        if (salaryMin) query.salary.$gte = Number(salaryMin);
        if (salaryMax) query.salary.$lte = Number(salaryMax);
    }
    if (searchTerm) {
        query.title = { $regex: new RegExp(searchTerm, 'i') };
    }

    try {
        const offerts = await Offert.find(query)
            .skip(Number(offset) || 0)
            .limit(Number(limit) || 20)
            .exec();
        const count = await Offert.countDocuments(query);
    
        return res.status(200).json({ offerts, count });
    } catch (error) {
        console.error('Error al buscar las ofertas:', error);
        return res.status(500).json({ message: 'Error al buscar las ofertas' });
    }
});

const getSearchSuggestions = asyncHandler(async (req, res) => {
    const { term } = req.query;
    const suggestions = await Offert.find(
        { title: { $regex: new RegExp(term, 'i'), isActive: true } }, // Asegúrate de que isActive sea true
        { title: 1, _id: 0 }
    )
    .limit(5)
    .lean();
    
    res.json(suggestions.map(s => s.title));
});

const getUniqueLocations = asyncHandler(async (req, res) => {
    const locations = await Offert.distinct('location', { isActive: true }); // Asegúrate de que isActive sea true
    if (locations.length > 0) {
        return res.status(200).json(locations);
    } else {
        return res.status(404).json({ message: "No locations found" });
    }
});

// EXPORT MODULE
module.exports = {
    createOffert,
    findAllOfferts,
    findOneOffert,
    filterAndSearchOfferts,
    deleteOneOffert,
    favoriteOffert,
    unfavoriteOffert,
    getFavoriteCount,
    getUserFavorites,
    feedOfferts,
    updateOffert,
    getUniqueLocations,
    getSearchSuggestions,
};
