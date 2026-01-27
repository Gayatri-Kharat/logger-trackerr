// Simple test script for service fetching functionality
import { fetchEnvironmentServices } from './services/integrationService.ts';

// Test cases for service fetching
async function testServiceFetching() {
  console.log('Testing Service Fetching Functionality...\n');

  // Test 1: Empty URL
  console.log('Test 1: Empty URL');
  try {
    await fetchEnvironmentServices('', 'test-token');
    console.log('❌ Should have thrown error for empty URL');
  } catch (error) {
    console.log('✅ Correctly threw error for empty URL:', error.message);
  }

  // Test 2: Invalid URL format
  console.log('\nTest 2: Invalid URL format');
  try {
    await fetchEnvironmentServices('not-a-url', 'test-token');
    console.log('❌ Should have thrown error for invalid URL');
  } catch (error) {
    console.log('✅ Correctly threw error for invalid URL:', error.message);
  }

  // Test 3: Valid URL but 404 response (using a real endpoint that should 404)
  console.log('\nTest 3: Valid URL with 404 response');
  try {
    const result = await fetchEnvironmentServices('https://httpbin.org/status/404', 'test-token');
    console.log('❌ Should have thrown error for 404 response');
  } catch (error) {
    console.log('✅ Correctly threw error for 404 response:', error.message);
  }

  // Test 4: Valid URL with successful response
  console.log('\nTest 4: Valid URL with successful response');
  try {
    const result = await fetchEnvironmentServices('https://httpbin.org/json', 'test-token');
    console.log('✅ Successfully fetched data:', result);
  } catch (error) {
    console.log('❌ Unexpected error:', error.message);
  }

  console.log('\nService fetching tests completed.');
}

// Run the tests
testServiceFetching();
