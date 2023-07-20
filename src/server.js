const express = require('express')
const {MongoClient} = require('mongodb');
const app = express()
const port = 3000

const axios = require("axios")
//process.env.MAOR
// import axios from "axios";
// const {response} = require("express");
const {v4: uuidv4} = require('uuid');
const {ObjectId} = require("bson");

/*===========================================================================*/

console.log("Starting up API server")

/*===========================================================================*/

// DB connection
const uri = 'mongodb://localhost:27017/?retryWrites=true&connectTimeoutMS=10000';
const client = new MongoClient(uri);

async function connectToDatabase() {
    try {
        await client.connect();
        console.log('Connected to the database');
    } catch (error) {
        console.error('Error connecting to the database:', error);
    }
}

(async () => {
    try {
        await connectToDatabase();


        /*===========================================================================*/

// Middleware to parse JSON request bodies
        app.use(express.json());

        /*===========================================================================*/

// endpoint 1: Get all todo items
        app.get('/getAllTodos', async (req, res) => {

            try {
                const db = client.db();
                const tasksInCollection = await db.collection('Tasks').find({}).toArray()

                if (tasksInCollection.length === 0) {
                    res.json({
                        status: "failure",
                        result: {
                            desc: "There are no tasks in the Tasks collection"
                        }
                    })
                } else {

                    // const usersArr = db.collection("Users").find()
                    const usersArr = await db.collection('Users').aggregate([{$project: {_id: 1}}]).toArray()
                    const user_ids = usersArr.map(item => item._id.toString());
                    let result = []


                    for (const user of user_ids) {
                        const userIdObj = new ObjectId(user); // Convert user ID string to ObjectId
                        const user_task = await db.collection('Tasks').find({uId: userIdObj}).project({
                            uId: 0,
                            userDetails: 0
                        }).toArray();
                        const userName = (await db.collection("Tasks").findOne({uId: userIdObj})).userDetails.userName
                        const userEmail = (await db.collection("Tasks").findOne({uId: userIdObj})).userDetails.userEmail
                        const numOfTasks = (await db.collection("Users").findOne({_id: userIdObj})).numberOfTasks
                        result.push({
                            userName: userName,
                            userEmail: userEmail,
                            userId: user,
                            numberOfTasks: numOfTasks,
                            tasks: user_task
                        });
                    }

                    res.json({
                        status: "success",
                        result: result
                    })
                }
            } catch (error) {
                console.error('Error retrieving all todos', error);
                res.status(500).json({error: 'Failed to retrieve all todos'});
            }
        });

        /*===========================================================================*/

// endpoint 2: Get all todos for a specific user
        app.post('/getUserTodos', async (req, res) => {
            const {userName, userEmail} = req.body;

            try {
                const db = client.db();

                // Check if the 'Tasks' collection exists
                const tasksCollectionExists = await db.listCollections({name: 'Tasks'}).hasNext();
                if (!tasksCollectionExists) {
                    res.status(404).json({error: '`Tasks` collection does not exist'});
                    return;
                }

                const todoCounter = await db.collection('Tasks').find({'userDetails.userEmail': userEmail}).toArray();
                const userEmailExist = (await db.collection('Tasks').findOne({'userDetails.userEmail': userEmail})).userDetails.userEmail
                const userNameExist = (await db.collection('Tasks').findOne({'userDetails.userName': userName}))
                const userTasks = await db.collection("Tasks").find({'userDetails.userEmail': userEmail}).toArray();


                if (!userNameExist) {
                    res.status(404).json({error: `User '${userName}' not found`});

                } else if (userNameExist && userTasks.length === 0) {
                    res.json({
                        result: {
                            status: "failure",
                            desc: `no todo items for user name: '${userName}'`
                        }
                    })
                } else if (!userEmailExist) {
                    res.json({
                        result: {
                            status: "failure",
                            desc: `There is no user with email: '${userEmail}'`
                        }
                    })
                } else {
                    res.json({
                        result: {
                            status: "success",
                            userName: userName,
                            userEmail: userEmail,
                            todos: todoCounter.length,
                            userTasks: userTasks
                        }
                    });
                }
            } catch (error) {
                console.error('Error retrieving user todos:', error);
                res.status(500).json({error: 'Failed to retrieve user todos'});
            }
        });

        /*===========================================================================*/

// endpoint 3: Get a specific todo item by ID for a specific user
        app.post('/getTodoById', async (req, res) => {
            const {userName, userEmail, todoId} = req.body;
            try {
                const db = client.db();

                // Check if the 'Tasks' collection exists
                const tasksCollectionExists = await db.listCollections({name: 'Tasks'}).hasNext();

                if (!tasksCollectionExists) {
                    res.status(404).json({error: 'No tasks found'});
                    return;
                } else {

                    const objectId = new ObjectId(todoId)
                    const userTask = (await db.collection('Tasks').findOne({_id: objectId}))
                    const userNameExist = await db.collection('Tasks').findOne({'userDetails.userName': userName})
                    const userEmailExist = await db.collection('Tasks').findOne({'userDetails.userEmail': userEmail})

                    if (!userNameExist) {
                        res.status(404).json({error: `User '${userName}' not found`});
                    } else if (!userTask) {
                        res.json({
                            result: {
                                status: "failure",
                                desc: `no todo item with id ${todoId}`
                            }
                        })
                    } else if (!userEmailExist) {
                        res.json({
                            result: {
                                status: "failure",
                                desc: `There is no user with email: '${userEmail}'`
                            }
                        })
                    } else {
                        res.json({
                            status: "success",
                            result: userTask
                        })
                    }
                }

            } catch (error) {
                console.error('Error retrieving user todos:', error);
                res.status(500).json({error: 'Failed to retrieve user todo item'});
            }
        });

        /*===========================================================================*/

// endpoint 4: Create a new todo item
        app.post('/setTodo', async (req, res) => {
            const {userName, userEmail, todoName, deadline, userPhone} = req.body;

            // Check if required fields are provided
            if (!userName || !userEmail || !todoName || !deadline) {
                res.status(400).json({error: 'Request must contain all of: [userName, userEmail, todoName, deadline]'});
                return;
            }

            try {
                const db = client.db(); // Get the reference to the database

                // Create the 'Tasks' collection if it doesn't exist
                const tasksCollectionExists = await db.listCollections({name: 'Tasks'}).hasNext();
                if (!tasksCollectionExists) {
                    await db.createCollection('Tasks');
                    console.log('Created the Tasks collection');
                }

                // Create the 'Users' collection if it doesn't exist
                const usersCollectionExists = await db.listCollections({name: 'Users'}).hasNext();
                if (!usersCollectionExists) {
                    await db.createCollection('Users');
                    console.log('Created the Users collection');
                }

                // Check if user already exists in Users collection by userEmail
                const existingUserInUsers = await db.collection('Users').findOne({userEmail: userEmail});

                if (!existingUserInUsers) {
                    // Insert the new user into the 'Users' collection
                    const addUser = await db.collection('Users').insertOne({
                        userName,
                        userEmail,
                        userPhone,
                        numberOfTasks: 1
                    });

                    if (!addUser.acknowledged) {
                        res.status(500).json({error: 'Failed to create a new user'});
                        return;
                    }
                } else {
                    // Increment the numberOfTasks for existing users
                    await db.collection('Users').updateOne({userEmail: userEmail}, {$inc: {numberOfTasks: 1}});
                }

                const currentDate = new Date()
                currentDate.setHours(currentDate.getHours() + 3)
                const cDate = currentDate.toISOString();

                // Create a new todo item
                const newTodo = {todoName, cDate, deadline, status: 'TO-DO'};

                const userID = (await db.collection("Users").findOne({userEmail: userEmail}))._id

                // Insert the new todo item into the 'Tasks' collection
                const pushTaskToDb = await db.collection('Tasks').insertMany([{
                    uId: userID,
                    userDetails: {userName, userEmail},
                    todoName,
                    cDate: cDate,
                    deadline,
                    status: 'TO-DO'
                }]);


                if (pushTaskToDb.acknowledged) {
                    newTodo.taskId = pushTaskToDb.insertedIds[0]
                    res.status(201).json({
                        message: "success",
                        result: newTodo
                    });
                } else {
                    res.status(500).json({error: 'Failed to create a new todo item'});
                }
            } catch (error) {
                console.error('Error creating a new todo item', error);
                res.status(500).json({error: 'Failed to create a new todo item'});
            }
        });


        /*===========================================================================*/

// endpoint 5: Update an existing todo item
        app.put('/updateTodo', async (req, res) => {
            const {todoId, userName, userEmail, updatedTodo} = req.body;

            if (!todoId || !userName || !userEmail || !updatedTodo) {
                res.status(400).json({
                    message: `must have all of: todoId || userName || userEmail || updatedTodo`
                })
                return;
            }

            const db = client.db(); // Get the reference to the database
            try {
                const {todoName, status, deadline} = updatedTodo

                const objectId = new ObjectId(todoId)
                const taskExist = await db.collection("Tasks").findOne({_id: objectId})

                if (!taskExist) {
                    res.status(400).json({
                        message: `no task with id ${todoId}`
                    })
                    return;
                }

                const updateMyTodo = await db.collection('Tasks').updateOne({_id: objectId}, {
                    $set: {
                        todoName,
                        status,
                        deadline
                    }
                })

                if (updateMyTodo.modifiedCount === 1) {
                    res.status(200).json({
                        message: "to do item updated successfully",
                        updatedItem: {
                            todoName: todoName,
                            todoStatus: status,
                            todoDeadline: deadline,
                            todoId: todoId
                        }
                    })
                } else {
                    res.status(400).json({
                        message: "Fail to update todo item"
                    })
                }

            } catch (error) {
                console.error('Error creating a new todo item', error);
                res.status(500).json({error: 'Failed to create a new todo item'});
            }
        });

        /*===========================================================================*/

// endpoint 6: Delete a specific todo item
        app.delete('/deleteTodoItem', async (req, res) => {
            const {todoId, userName, userEmail} = req.body;

            if (!todoId || !userName || !userEmail) {
                res.status(400).json({
                    message: "must have all of: todoId || userName || userEmail"
                })
            }

            try {
                const db = client.db();
                const objectId = new ObjectId(todoId)
                const deleteResult = await db.collection('Tasks').deleteOne({_id: objectId});


                if (deleteResult.deletedCount === 1) {
                    const updateInUsers = await db.collection("Users").updateOne(
                        {userEmail: userEmail},
                        {$inc: {numberOfTasks: -1}}
                    )

                    if (updateInUsers.modifiedCount === 1) {
                        res.status(200).json({
                            message: "success",
                            desc: `todo with id ${todoId} has been deleted`
                        })
                    } else {
                        res.status(400).json({
                            message: `fail to update id: ${todoId} | id not exist in DB`
                        })
                    }

                } else {
                    res.status(400).json({
                        message: `fail to update id: ${todoId} | id not exist in DB`
                    })
                }
            } catch (error) {
                console.error('Error creating a new todo item', error);
                res.status(500).json({error: 'Failed to create a new todo item'});
            }
        });

        /*===========================================================================*/

// endpoint 7: Delete all todos for a specific user
        app.delete('/deleteUserTodos', async (req, res) => {
            const {userName, userEmail} = req.body;

            if (!userName || !userEmail) {
                res.status(400).json({
                    message: "must have all of: todoId || userName || userEmail"
                })
            }

            try {
                const db = client.db();

                const numOfTasksForUser = (await db.collection("Tasks").countDocuments({'userDetails.userEmail': userEmail}))
                const deleteAllRecordsForUser = await db.collection('Tasks').deleteMany({'userDetails.userEmail': userEmail});


                if (deleteAllRecordsForUser.deletedCount > 0) {
                    const updateInUsers = await db.collection("Users").updateOne(
                        {userEmail: userEmail},
                        {$inc: {numberOfTasks: -numOfTasksForUser}}
                    )

                    if (updateInUsers.modifiedCount === 1) {
                        res.status(200).json({
                            message: "success",
                            desc: `All todos for user with mail ${userEmail} was deleted`
                        })
                    } else {
                        res.status(400).json({
                            message: `fail to delete tasks for user: ${userEmail} | email not exist in DB`
                        })
                    }

                } else {
                    res.status(400).json({
                        message: `fail to delete tasks for user: ${userEmail} | email not exist in DB`
                    })
                }
            } catch (error) {
                console.error('general error', error);
                res.status(500).json({error: 'general error'});
            }
        });

        /*===========================================================================*/

// endpoint 8: - Delete all todos for all users
        app.delete('/deleteAllTodos', async (req, res) => {

            try {
                const db = client.db();
                const deleteAllTasks = db.collection("Tasks").deleteMany({})
                const resetUserCounter = await db.collection("Users").updateMany({}, {$set: {numberOfTasks: 0}});

                if ((await deleteAllTasks).deletedCount === 0 && resetUserCounter.modifiedCount === 0) {
                    res.status(400).json({
                        message: "there are no tasks to delete :-("
                    })
                    return;
                }

                res.status(200).json({
                    message: "all tasks deleted successfully :-)"
                })
            } catch (error) {
                console.error('general error', error);
                res.status(500).json({error: 'general error'});
            }
        });

        /*===========================================================================*/

// endpoint 9: - Delete all users from Users collection
        app.delete(`/deleteAllUsers`, async (req, res) => {
            try {
                const db = client.db()
                const deleteAllUsers = db.collection("Users").deleteMany({})

                if ((await deleteAllUsers).deletedCount === 0) {
                    res.status(400).json({
                        message: "there are no users in Users collection :-("
                    })
                    return;
                }
                res.status(200).json({
                    message: "all users deleted successfully :-)"
                })

            } catch (error) {
                res.status(400).json({
                    message: `unable to complete the request`
                })
            }
        })

        /*===========================================================================*/

// endpoint 10: - clear DB (Users + Tasks collections)

        app.delete(`/clearDB`, async (req, res) => {
            try {
                const db = client.db()
                const deleteAllTasks = db.collection("Tasks").deleteMany({})
                const deleteAllUsers = db.collection("Users").deleteMany({})

                if ((await deleteAllTasks).deletedCount === 0 && (await deleteAllUsers).deletedCount === 0) {
                    res.status(400).json({
                        message: "DB is empty :-/"
                    })
                    return;
                }

                if ((await deleteAllTasks).deletedCount === 0) {
                    res.status(400).json({
                        message: "there are no tasks in Tasks collection :-("
                    })
                    return;
                }

                if ((await deleteAllUsers).deletedCount === 0) {
                    res.status(400).json({
                        message: "there are no users in Users collection :-("
                    })
                    return;
                }


                res.status(200).json({
                    message: "DB has been cleared :-)"
                })

            } catch (error) {
                res.status(400).json({
                    message: `unable to complete the request`
                })
            }
        })
        /*===========================================================================*/

// endpoint 11: - set config collection for all users
        app.post('/setConfig', async (req, res) => {
            try {
                const db = client.db(); // Get the reference to the database

                // Check if the 'configurations' collection already exists
                const collectionExists = await db.listCollections({name: 'configurations'}).hasNext();

                if (collectionExists) {
                    // Update the existing collection with new parameters

                    const result = await db.collection('configurations').insertOne(req.body);

                    if (result.acknowledged > 0) {
                        // const updatedDocument = ;
                        res.status(200).json({result: await db.collection('configurations').findOne({})});
                    } else {
                        res.status(500).json({error: 'Failed to update the configuration'});
                    }
                } else {
                    // Create the 'configurations' collection
                    await db.createCollection('configurations');
                    console.log('Created the configurations collection');

                    // Insert the new configuration document
                    const result = await db.collection('configurations').insertOne(req.body);

                    if (result.acknowledged) {
                        res.status(201).json({result: result});
                    } else {
                        res.status(500).json({error: 'Failed to create the configuration'});
                    }
                }
            } catch (error) {
                console.error('Error creating/updating the configuration', error);
                res.status(500).json({error: 'Failed to create/update the configuration'});
            }
        });

        /*===========================================================================*/
// endpoint 12: - reset config collection for all users
        app.delete('/resetConfig', async (req, res) => {
            try {
                const db = client.db()
                const resetConfig = await db.collection("configurations").deleteMany({})

                if (resetConfig.deletedCount > 0) {
                    res.json({message: "configurations has being reset"});
                } else {
                    res.status(400).json({message: "fail to reset configurations"})
                }

            } catch (error) {
                console.error('Error reset configuration', error);
                res.status(500).json({error: 'Failed to reset the configuration'});
            }

        })


// Start the server
        app.listen(port, () => {
            console.log(`API server is running on http://localhost:${port}`);
        });


    } catch (error) {
        console.error('Error starting the server:', error);
    }
})();
