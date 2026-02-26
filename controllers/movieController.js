const { getCollectionMovie, initDBIfNecessary } = require("../config/database");
const { ObjectId } = require("mongodb");

async function createMovie(movieData) {
  await initDBIfNecessary();
  movieData.created = new Date();

  const collectionMovie = getCollectionMovie(); // <- get the actual collection
  await collectionMovie.insertOne(movieData)

}

// Get all movies (for movieList.ejs)
async function getAllMovies(req, res) {
  await initDBIfNecessary();
  //   const movies = await getCollectionMovie().find({}).toArray();

  const collectionMovie = getCollectionMovie(); // <- must call the function
  const movies = await collectionMovie.find({}).toArray();

  res.render("movies/movieList", {movies, title: 'Movie List'  });
}

// Get single movie by ID (for movieDetail.ejs)

// async function getMovieDetail(req, res) {
//   await initDBIfNecessary();

//   const id = req.params.id;

//   if (!ObjectId.isValid(id)) {
//     return res.status(400).send("Invalid movie ID");
//   }
//   const collectionMovie = getCollectionMovie(); // <- must call
//   const movie = await collectionMovie.findOne({ _id: new ObjectId(req.params.id) });

//   //   const movie = await getCollectionMovie().findOne({ _id: new ObjectId(req.params.id) });
//   if (!movie) return res.send("Movie not found");
//   res.render("movies/movieDetail", { movie });

  
// }

async function getMoviebyId(movieId) {
    await initDBIfNecessary();
    if (!movieId) {
        return null;
    }

    const collectionMovie = getCollectionMovie()

    return collectionMovie.findOne({
        _id: ObjectId.createFromHexString(movieId)
    });
}

async function updateMovie(id, movieData) {
  await initDBIfNecessary();
  const collectionMovie = getCollectionMovie();

  await collectionMovie.updateOne(
    { _id: new ObjectId(id) },
    { $set: movieData }
  );
}

async function deleteMovie(id) {
  await initDBIfNecessary();
  if (!ObjectId.isValid(id)) throw new Error("Invalid movie ID");

  const collectionMovie = getCollectionMovie();
  const result = await collectionMovie.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    throw new Error("Movie not found");
  }
}



module.exports = {
  createMovie,
  getAllMovies, 
  getMoviebyId,
  updateMovie,
  deleteMovie,
};
